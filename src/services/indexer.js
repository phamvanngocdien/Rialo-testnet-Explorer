/**
 * Lightweight client-side cache/merge layer for account transaction history.
 *
 * IMPORTANT: every value handled here must originate from a real RPC
 * response (rpc.getSignaturesForAddress / rpc.getTransaction). This module
 * never invents signatures, balances, or transaction counts — it only
 * caches and merges data that was actually returned by the Rialo node, so
 * that switching pages/accounts doesn't refetch things unnecessarily.
 */

/**
 * Get all known transactions for an address, combining:
 * 1. Previously fetched (real) signatures cached in localStorage for this session
 * 2. Fresh live signatures just returned by rpc.getSignaturesForAddress
 *
 * @param {string} address - Base58 wallet or program address
 * @param {Array} rpcSignatures - Real signatures returned from getSignaturesForAddress
 * @returns {Array} Deduplicated, real signature objects sorted descending by block height
 */
export function getFullAccountTransactions(address, rpcSignatures = []) {
  if (!address) return [];

  const map = new Map();

  // 1. Load previously cached real transactions for this address (from earlier RPC calls)
  try {
    const stored = JSON.parse(localStorage.getItem(`rialo_txs_${address}`) || '[]');
    if (Array.isArray(stored)) {
      stored.forEach(item => {
        const sig = typeof item === 'string' ? item : item.signature;
        if (sig) map.set(sig, typeof item === 'string' ? { signature: sig } : item);
      });
    }
  } catch (e) { /* ignore corrupt cache */ }

  // 2. Merge freshest live RPC signatures (overwrites with latest known state)
  if (Array.isArray(rpcSignatures)) {
    rpcSignatures.forEach(item => {
      const sig = typeof item === 'string' ? item : item.signature;
      if (!sig) return;
      const existing = map.get(sig) || {};
      map.set(sig, {
        ...existing,
        signature: sig,
        blockHeight: item.blockHeight ?? item.slot ?? existing.blockHeight ?? null,
        blockTime: item.blockTime ?? existing.blockTime ?? null,
        status: item.err ? 'failed' : 'success',
        fee: existing.fee ?? null
      });
    });
  }

  const allSignatures = Array.from(map.values());

  allSignatures.sort((a, b) => {
    const hA = Number(a.blockHeight) || 0;
    const hB = Number(b.blockHeight) || 0;
    return hB - hA;
  });

  // Persist merged real data for this address so it's instant on next visit
  try {
    localStorage.setItem(`rialo_txs_${address}`, JSON.stringify(allSignatures));
  } catch (e) { /* storage full or unavailable, non-fatal */ }

  return allSignatures;
}

/**
 * Register a real, RPC-confirmed transaction against every account key it
 * touches, so the account page can find it later without a full re-scan.
 * @param {Object} tx - a real transaction object as returned by rpc.getTransaction
 */
export function indexTransaction(tx) {
  if (!tx || !tx.transaction) return;
  const sig = (tx.transaction.signatures && tx.transaction.signatures[0]) || null;
  if (!sig) return;

  const blockHeight = tx.block_height ?? tx.blockHeight ?? null;
  const blockTime = tx.blockTime ?? tx.transaction.validFrom ?? null;
  const status = tx.meta?.err ? 'failed' : 'success';
  const fee = tx.meta?.fee ?? null;

  const accounts = tx.transaction.message?.accountKeys || [];
  for (const k of accounts) {
    const addr = typeof k === 'string' ? k : k?.pubkey;
    if (!addr || addr.length < 20) continue;
    try {
      const stored = JSON.parse(localStorage.getItem(`rialo_txs_${addr}`) || '[]');
      if (!stored.some(t => t.signature === sig)) {
        stored.unshift({ signature: sig, blockHeight, blockTime, status, fee });
        localStorage.setItem(`rialo_txs_${addr}`, JSON.stringify(stored.slice(0, 500)));
      }
    } catch (e) { /* non-fatal */ }
  }
}
