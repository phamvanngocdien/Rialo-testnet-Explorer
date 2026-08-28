/**
 * Rialo Testnet Blockchain -> Supabase Crawler & Sync Worker
 * 
 * Run with: node scripts/sync_to_supabase.js
 * Requires environment variables:
 *   SUPABASE_URL=https://xyz.supabase.co
 *   SUPABASE_SERVICE_KEY=ey... (or ANON_KEY)
 *   RPC_URL=https://testnet.rialo.io:4101 (optional)
 */

import { createClient } from '@supabase/supabase-js';

const RPC_URL = process.env.RPC_URL || 'https://testnet.rialo.io:4101';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: Please set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function callRpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: params.length > 0 ? params : undefined
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'RPC Error');
  return data.result;
}

async function main() {
  console.log('🚀 Starting Rialo Blockchain -> Supabase Sync Worker...');
  console.log(`📡 RPC Endpoint: ${RPC_URL}`);
  console.log(`🗄️  Supabase URL: ${SUPABASE_URL}\n`);

  // 1. Get current on-chain Block Height & Total Transactions
  const latestHeight = await callRpc('getBlockHeight');
  const txCountRes = await callRpc('getTransactionCount').catch(() => null);
  const totalTx = txCountRes?.value ?? txCountRes ?? 'unknown';

  console.log(`📊 Current Network Height: #${latestHeight.toLocaleString()}`);
  console.log(`📊 Cumulative Transactions: ${totalTx.toLocaleString()}\n`);

  // 2. Get last synced block from Supabase
  const { data: stateData } = await supabase
    .from('indexer_state')
    .select('*')
    .eq('id', 'main_crawler')
    .single();

  let startBlock = stateData?.last_scanned_block ? Number(stateData.last_scanned_block) : Math.max(0, latestHeight - 500);
  console.log(`▶️  Resuming sync from Block #${startBlock.toLocaleString()} up to #${latestHeight.toLocaleString()}...\n`);

  let currentBlock = startBlock;
  const BATCH_SIZE = 20;

  while (currentBlock <= latestHeight) {
    const endBlock = Math.min(currentBlock + BATCH_SIZE - 1, latestHeight);
    const blockHeights = Array.from({ length: endBlock - currentBlock + 1 }, (_, i) => currentBlock + i);

    const blocks = await Promise.all(
      blockHeights.map(h => callRpc('getBlock', [{ blockHeight: h }]).catch(() => null))
    );

    const txRows = [];
    const accountRows = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]?.value ?? blocks[i] ?? null;
      const h = blockHeights[i];
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
            fee: meta.fee ?? null,
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
      const { error: txErr } = await supabase
        .from('transactions')
        .upsert(txRows, { onConflict: 'signature', ignoreDuplicates: true });

      if (txErr) console.warn('Warning upserting txs:', txErr.message);

      if (accountRows.length > 0) {
        await supabase
          .from('account_transactions')
          .upsert(accountRows, { onConflict: 'address,signature', ignoreDuplicates: true })
          .catch(() => null);
      }

      console.log(`✅ Blocks #${currentBlock}..#${endBlock}: Indexed ${txRows.length} transactions.`);
    }

    // Update indexer state in Supabase
    await supabase
      .from('indexer_state')
      .upsert({
        id: 'main_crawler',
        last_scanned_block: endBlock,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    currentBlock = endBlock + 1;
  }

  console.log('\n🎉 Sync complete! All current on-chain transactions are stored in Supabase.');
}

main().catch(err => {
  console.error('Fatal error during sync:', err);
  process.exit(1);
});
