/**
 * Vercel Serverless Function: Scheduled Blockchain Sync Worker
 * Endpoint: /api/sync
 * 
 * Bounded execution designed for Vercel Serverless Function limits:
 * - Scans a maximum of 2 batches (40 blocks) per run (~3-5s execution time).
 * - Utilizes the exact same Atomic Distributed Lock to prevent collisions with GitHub Actions.
 * - Protected with CRON_SECRET authorization header.
 */

import { createClient } from '@supabase/supabase-js';

const RPC_URL = process.env.RPC_URL || 'https://testnet.rialo.io:4101';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

async function callRpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params: params.length > 0 ? params : undefined
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'RPC Error');
  return data.result;
}

export default async function handler(req, res) {
  // 1. Verify CRON_SECRET if configured
  if (CRON_SECRET) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (token !== CRON_SECRET && req.query?.secret !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET' });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY server environment variables' });
  }

  if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = class DummyWebSocket {
      constructor() {}
      close() {}
      send() {}
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const nowIso = new Date().toISOString();
  const lockedUntilIso = new Date(Date.now() + 120000).toISOString(); // 2 minute lock

  // 2. Acquire Atomic Lock with exact matching condition
  const { data: lockResult, error: lockErr } = await supabase
    .from('indexer_state')
    .update({
      sync_locked_until: lockedUntilIso,
      is_syncing: true,
      updated_at: nowIso
    })
    .eq('id', 'main_crawler')
    .or(`sync_locked_until.is.null,sync_locked_until.lt.${nowIso}`)
    .select('id');

  if (lockErr || !lockResult || lockResult.length === 0) {
    return res.status(200).json({
      status: 'skipped',
      message: 'Another worker is currently active and holding the sync lock.'
    });
  }

  let finalScanned = null;
  let totalIndexedInRun = 0;

  try {
    // 3. Get Network Height & Current State
    const latestHeight = await callRpc('getBlockHeight');
    const { data: stateData } = await supabase
      .from('indexer_state')
      .select('*')
      .eq('id', 'main_crawler')
      .single();

    let startBlock = stateData?.last_scanned_block !== null && stateData?.last_scanned_block !== undefined
      ? Number(stateData.last_scanned_block) + 1
      : Math.max(0, latestHeight - 100);

    let currentTotalIndexed = Number(stateData?.total_indexed_transactions) || 0;

    if (startBlock > latestHeight) {
      return res.status(200).json({
        status: 'up_to_date',
        lastScannedBlock: startBlock - 1,
        latestHeight
      });
    }

    // 4. Bound scan to at most 40 blocks (2 batches x 20) per serverless invocation
    const MAX_BLOCKS_PER_INVOCATION = 40;
    const endTarget = Math.min(startBlock + MAX_BLOCKS_PER_INVOCATION - 1, latestHeight);
    const BATCH_SIZE = 20;

    let currentBlock = startBlock;

    while (currentBlock <= endTarget) {
      const batchEnd = Math.min(currentBlock + BATCH_SIZE - 1, endTarget);
      const heights = Array.from({ length: batchEnd - currentBlock + 1 }, (_, i) => currentBlock + i);

      const rawBlocks = await Promise.all(
        heights.map(h => callRpc('getBlock', [{ blockHeight: h }]).catch(() => null))
      );

      const txRows = [];
      const accountRows = [];

      for (let i = 0; i < rawBlocks.length; i++) {
        const block = rawBlocks[i]?.value ?? rawBlocks[i] ?? null;
        const h = heights[i];
        if (!block) continue;

        const bTime = block.blockTime
          ? (Number(block.blockTime) < 10000000000 ? Number(block.blockTime) * 1000 : Number(block.blockTime))
          : null;

        if (Array.isArray(block.transactions)) {
          for (const entry of block.transactions) {
            const tx = entry?.transaction || {};
            const meta = entry?.meta || {};
            const accountKeys = tx.message?.accountKeys || [];
            const sig = (tx.signatures && tx.signatures[0]) || tx.signature || null;
            if (!sig) continue;

            const fromAddr = typeof accountKeys[0] === 'string' ? accountKeys[0] : (accountKeys[0]?.pubkey || null);
            const toAddr = typeof accountKeys[1] === 'string' ? accountKeys[1] : (accountKeys[1]?.pubkey || null);

            txRows.push({
              signature: sig,
              block_height: h,
              block_time: bTime,
              from_address: fromAddr,
              to_address: toAddr,
              fee: typeof meta.fee === 'number' ? meta.fee : null,
              status: meta.err ? 'failed' : 'success',
              instruction_count: tx.message?.instructions?.length || 0,
              raw_data: entry
            });

            if (fromAddr && fromAddr.length >= 20) {
              accountRows.push({ address: fromAddr, signature: sig, block_height: h, block_time: bTime });
            }
            if (toAddr && toAddr.length >= 20 && toAddr !== fromAddr) {
              accountRows.push({ address: toAddr, signature: sig, block_height: h, block_time: bTime });
            }
          }
        }
      }

      if (txRows.length > 0) {
        await supabase
          .from('transactions')
          .upsert(txRows, { onConflict: 'signature', ignoreDuplicates: true });

        if (accountRows.length > 0) {
          await supabase
            .from('account_transactions')
            .upsert(accountRows, { onConflict: 'address,signature', ignoreDuplicates: true })
            .catch(() => null);
        }

        totalIndexedInRun += txRows.length;
        currentTotalIndexed += txRows.length;
      }

      finalScanned = batchEnd;
      currentBlock = batchEnd + 1;
    }

    // Update indexer state
    await supabase
      .from('indexer_state')
      .upsert({
        id: 'main_crawler',
        last_scanned_block: finalScanned,
        total_indexed_transactions: currentTotalIndexed,
        is_syncing: false,
        sync_locked_until: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    return res.status(200).json({
      success: true,
      scannedFrom: startBlock,
      scannedTo: finalScanned,
      indexedTransactions: totalIndexedInRun,
      totalIndexed: currentTotalIndexed,
      latestHeight
    });

  } catch (err) {
    console.error('API Sync Error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    // 5. Always release lock cleanly
    await supabase
      .from('indexer_state')
      .update({
        is_syncing: false,
        sync_locked_until: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', 'main_crawler')
      .catch(() => null);
  }
}
