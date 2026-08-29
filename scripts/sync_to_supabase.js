/**
 * Rialo Testnet Blockchain -> Supabase Crawler & Sync Worker
 * v3.0 — Enterprise-grade sync with Atomic Distributed Lock, Heartbeat, and Full Backfill.
 * 
 * Usage:
 *   node scripts/sync_to_supabase.js [options]
 * 
 * Options:
 *   --from=<block>      Start syncing from specific block height (e.g. --from=0 for full genesis backfill)
 *   --clean             Wipe/truncate previous transactions & reset indexer_state before starting
 *   --batch-size=<num>  Number of blocks to fetch in parallel per batch (default: 25)
 *   --delay=<ms>        Throttle delay in milliseconds between batches to protect RPC (default: 200)
 *   --help              Show this help message
 * 
 * Environment Variables:
 *   SUPABASE_URL          Supabase Project URL (Required)
 *   SUPABASE_SERVICE_KEY  Supabase Service Role Secret Key (Required - Bypasses RLS)
 *   RPC_URL               Rialo Testnet RPC Endpoint (Optional, default: https://testnet.rialo.io:4101)
 */

import { createClient } from '@supabase/supabase-js';

// Parse CLI flags
const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const getParam = (name) => {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.substring(prefix.length) : null;
};

if (hasFlag('help') || hasFlag('h')) {
  console.log(`
Rialo Testnet -> Supabase Crawler & Sync Worker
-----------------------------------------------
Usage:
  node scripts/sync_to_supabase.js [options]

Options:
  --from=<block>       Start syncing from specific block height (e.g. --from=0 for full genesis backfill)
  --clean              Wipe/truncate previous transactions & reset indexer_state before starting
  --batch-size=<num>   Number of blocks to fetch per batch (default: 25)
  --delay=<ms>         Throttle delay in ms between batches (default: 200)
  --help               Show this help message

Environment Variables:
  SUPABASE_URL         Supabase Project URL
  SUPABASE_SERVICE_KEY Supabase Service Role Secret Key (Required)
  RPC_URL              Rialo Testnet RPC Endpoint
`);
  process.exit(0);
}

const RPC_URL = process.env.RPC_URL || 'https://testnet.rialo.io:4101';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) {
  console.error('❌ Error: SUPABASE_URL is not set.');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_KEY (Service Role Key) is required for write operations.');
  console.error('   Please get your service_role secret from Supabase Dashboard -> Project Settings -> API.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const BATCH_SIZE = Math.max(1, parseInt(getParam('batch-size') || '25', 10));
const DELAY_MS = Math.max(0, parseInt(getParam('delay') || '200', 10));
const CUSTOM_START_BLOCK = getParam('from') !== null ? parseInt(getParam('from'), 10) : null;
const IS_CLEAN = hasFlag('clean');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

// --- Distributed Lock Helpers ---

async function acquireSyncLock(lockSeconds = 300) {
  try {
    // 1. Try stored procedure if created
    const rpcRes = await supabase.rpc('acquire_sync_lock', { lock_seconds: lockSeconds }).catch(() => null);
    if (rpcRes && rpcRes.data !== null && rpcRes.data !== undefined) {
      return Boolean(rpcRes.data);
    }

    // 2. Direct atomic single UPDATE with conditional WHERE
    const nowIso = new Date().toISOString();
    const lockedUntilIso = new Date(Date.now() + lockSeconds * 1000).toISOString();

    const { data, error } = await supabase
      .from('indexer_state')
      .update({
        sync_locked_until: lockedUntilIso,
        is_syncing: true,
        updated_at: nowIso
      })
      .eq('id', 'main_crawler')
      .or(`sync_locked_until.is.null,sync_locked_until.lt.${nowIso}`)
      .select('id');

    if (error) {
      console.warn('⚠️ Lock acquisition check returned:', error.message);
      return false;
    }

    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error('Error during lock acquisition:', err);
    return false;
  }
}

async function renewSyncLock(lockSeconds = 300) {
  try {
    const lockedUntilIso = new Date(Date.now() + lockSeconds * 1000).toISOString();
    await supabase
      .from('indexer_state')
      .update({
        sync_locked_until: lockedUntilIso,
        is_syncing: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'main_crawler');
  } catch (e) {}
}

async function releaseSyncLock(lastScanned = null, txIncrement = 0) {
  try {
    const updatePayload = {
      is_syncing: false,
      sync_locked_until: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (lastScanned !== null) updatePayload.last_scanned_block = lastScanned;

    await supabase
      .from('indexer_state')
      .update(updatePayload)
      .eq('id', 'main_crawler');
  } catch (e) {}
}

async function main() {
  console.log('====================================================');
  console.log('🚀 RIALO TESTNET -> SUPABASE CRAWLER & SYNC WORKER');
  console.log('====================================================');
  console.log(`📡 RPC Endpoint  : ${RPC_URL}`);
  console.log(`🗄️  Supabase URL  : ${SUPABASE_URL}`);
  console.log(`⚙️  Batch Size    : ${BATCH_SIZE} blocks/batch`);
  console.log(`⏱️  Throttle Delay: ${DELAY_MS} ms/batch`);
  if (CUSTOM_START_BLOCK !== null) console.log(`🎯 Custom Start  : Block #${CUSTOM_START_BLOCK}`);
  if (IS_CLEAN) console.log(`🧹 Clean Mode    : Enabled (Wiping previous data)`);
  console.log('----------------------------------------------------\n');

  // 1. Acquire Atomic Lock
  const lockAcquired = await acquireSyncLock(300);
  if (!lockAcquired) {
    console.log('🔒 Notice: Another sync worker is currently active and holds the lock.');
    console.log('   Exiting gracefully to prevent concurrent write collisions and RPC overload.');
    process.exit(0);
  }

  console.log('🔑 Atomic lock acquired successfully.');

  // 2. Setup Heartbeat Timer (Renews lock every 60s)
  const heartbeatInterval = setInterval(() => {
    renewSyncLock(300).catch(() => null);
  }, 60000);

  let currentBlock = 0;
  let totalIndexedCount = 0;

  try {
    // 3. Optional DB Clean Reset
    if (IS_CLEAN) {
      console.log('🧹 Truncating old tables and resetting state...');
      await supabase.from('account_transactions').delete().neq('id', 0).catch(() => null);
      await supabase.from('transactions').delete().neq('signature', '').catch(() => null);
      await supabase.from('indexer_state').upsert({
        id: 'main_crawler',
        last_scanned_block: 0,
        total_indexed_transactions: 0,
        is_syncing: true,
        sync_locked_until: new Date(Date.now() + 300000).toISOString(),
        updated_at: new Date().toISOString()
      });
      console.log('✅ Database reset complete.');
    }

    // 4. Fetch Network Block Height
    const latestHeight = await callRpc('getBlockHeight');
    const txCountRes = await callRpc('getTransactionCount').catch(() => null);
    const networkTxCount = typeof txCountRes === 'object' ? (txCountRes?.value ?? 'unknown') : (txCountRes ?? 'unknown');

    console.log(`📊 Current Network Height       : #${latestHeight.toLocaleString()}`);
    console.log(`📊 Total Network Tx Count (RPC) : ${typeof networkTxCount === 'number' ? networkTxCount.toLocaleString() : networkTxCount}\n`);

    // 5. Determine Starting Block
    const { data: stateData } = await supabase
      .from('indexer_state')
      .select('*')
      .eq('id', 'main_crawler')
      .single();

    totalIndexedCount = Number(stateData?.total_indexed_transactions) || 0;

    let startBlock;
    if (CUSTOM_START_BLOCK !== null) {
      startBlock = Math.max(0, CUSTOM_START_BLOCK);
    } else if (stateData && stateData.last_scanned_block !== null && stateData.last_scanned_block !== undefined) {
      startBlock = Math.max(0, Number(stateData.last_scanned_block) + 1);
    } else {
      // Genesis backfill default on fresh DB
      startBlock = 0;
    }

    if (startBlock > latestHeight) {
      console.log(`✨ Sync is fully up to date! (Last scanned: #${startBlock - 1}, Network Height: #${latestHeight})`);
      return;
    }

    const totalBlocksToScan = latestHeight - startBlock + 1;
    console.log(`▶️  Starting sync from Block #${startBlock.toLocaleString()} to #${latestHeight.toLocaleString()} (${totalBlocksToScan.toLocaleString()} blocks total)...\n`);

    currentBlock = startBlock;
    const startTime = Date.now();
    let batchIndex = 0;

    while (currentBlock <= latestHeight) {
      const endBlock = Math.min(currentBlock + BATCH_SIZE - 1, latestHeight);
      const heights = Array.from({ length: endBlock - currentBlock + 1 }, (_, i) => currentBlock + i);

      // Fetch blocks in batch
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

      // Upsert batch transactions into Supabase
      if (txRows.length > 0) {
        const { error: txErr } = await supabase
          .from('transactions')
          .upsert(txRows, { onConflict: 'signature', ignoreDuplicates: true });

        if (txErr) console.warn(`⚠️ Warning upserting txs at #${currentBlock}:`, txErr.message);

        if (accountRows.length > 0) {
          await supabase
            .from('account_transactions')
            .upsert(accountRows, { onConflict: 'address,signature', ignoreDuplicates: true })
            .catch(() => null);
        }

        totalIndexedCount += txRows.length;
      }

      // Update checkpoint state and total counter
      await supabase
        .from('indexer_state')
        .upsert({
          id: 'main_crawler',
          last_scanned_block: endBlock,
          total_indexed_transactions: totalIndexedCount,
          is_syncing: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      batchIndex++;
      const scannedSoFar = endBlock - startBlock + 1;
      const pct = ((scannedSoFar / totalBlocksToScan) * 100).toFixed(1);
      const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);
      const rate = (scannedSoFar / elapsedSec).toFixed(1);

      console.log(`[${pct}%] Blocks #${currentBlock.toLocaleString()}..#${endBlock.toLocaleString()}: Found ${txRows.length} txs (Total: ${totalIndexedCount.toLocaleString()} txs, Speed: ${rate} blk/s)`);

      currentBlock = endBlock + 1;

      // Throttle delay between batches to protect public RPC node
      if (DELAY_MS > 0 && currentBlock <= latestHeight) {
        await sleep(DELAY_MS);
      }
    }

    console.log('\n====================================================');
    console.log(`🎉 Sync Completed Successfully!`);
    console.log(`📊 Last Scanned Block: #${(currentBlock - 1).toLocaleString()}`);
    console.log(`📊 Total Indexed Txs : ${totalIndexedCount.toLocaleString()}`);
    console.log('====================================================');

  } catch (err) {
    console.error('❌ Fatal error during sync:', err);
  } finally {
    clearInterval(heartbeatInterval);
    await releaseSyncLock(currentBlock > 0 ? currentBlock - 1 : null, 0);
    console.log('🔓 Sync lock released.');
  }
}

// Handle termination signals cleanly
process.on('SIGINT', async () => {
  console.log('\n⚠️ Interrupt signal received. Releasing lock and exiting...');
  await releaseSyncLock();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️ Terminate signal received. Releasing lock and exiting...');
  await releaseSyncLock();
  process.exit(0);
});

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
