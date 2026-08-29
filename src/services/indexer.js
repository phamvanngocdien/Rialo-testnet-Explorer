/**
 * Network & Account Transaction Indexer for Rialo Explorer
 *
 * Provides a client-side persistent storage and deduplication layer for all
 * real on-chain transactions discovered across the Rialo network.
 */

const STORAGE_KEY_NETWORK_TXS = 'rialo_network_txs_v2';
const MAX_CACHED_TXS = 3000;

// In-memory transaction map keyed by signature
const networkTxMap = new Map();
let isInitialized = false;

function initNetworkTxMap() {
  if (isInitialized) return;
  isInitialized = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NETWORK_TXS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(tx => {
          if (tx && tx.signature) {
            networkTxMap.set(tx.signature, tx);
          }
        });
      }
    }
  } catch (e) {
    // Ignore corrupt localStorage
  }
}

/**
 * Persist current in-memory pool to localStorage
 */
function saveNetworkTransactions() {
  try {
    const list = Array.from(networkTxMap.values());
    list.sort((a, b) => {
      const hA = Number(a.blockHeight) || 0;
      const hB = Number(b.blockHeight) || 0;
      if (hB !== hA) return hB - hA;
      const tA = Number(a.blockTime) || 0;
      const tB = Number(b.blockTime) || 0;
      return tB - tA;
    });
    localStorage.setItem(STORAGE_KEY_NETWORK_TXS, JSON.stringify(list.slice(0, MAX_CACHED_TXS)));
  } catch (e) {
    // Storage full or unavailable
  }
}

/**
 * Add an array of real transactions to the global network pool.
 * @param {Array<Object>} newTxs
 */
export function addNetworkTransactions(newTxs) {
  if (!Array.isArray(newTxs) || newTxs.length === 0) return;
  initNetworkTxMap();

  let hasNew = false;
  for (const tx of newTxs) {
    if (!tx || !tx.signature) continue;
    const existing = networkTxMap.get(tx.signature);
    if (!existing) {
      networkTxMap.set(tx.signature, tx);
      hasNew = true;
    } else {
      // Merge fresher details
      networkTxMap.set(tx.signature, {
        ...existing,
        ...tx,
        from: tx.from || existing.from || null,
        to: tx.to || existing.to || null,
        fee: tx.fee ?? existing.fee ?? null,
        status: tx.status || existing.status || 'success'
      });
    }
  }

  if (hasNew) {
    saveNetworkTransactions();
  }
}

/**
 * Register all transactions inside a confirmed block into the indexer.
 * @param {Object} block - Block object returned from getBlock
 * @param {number} blockHeight - Height of the block
 * @returns {Array} Array of extracted transaction objects
 */
export function registerBlockTransactions(block, blockHeight) {
  if (!block) return [];
  initNetworkTxMap();

  const h = Number(blockHeight);
  const bTime = block.blockTime
    ? (Number(block.blockTime) < 10000000000 ? Number(block.blockTime) * 1000 : Number(block.blockTime))
    : Date.now();

  const extracted = [];

  // Extract from block.transactions (full objects)
  if (Array.isArray(block.transactions)) {
    for (const entry of block.transactions) {
      const tx = entry?.transaction || {};
      const meta = entry?.meta || {};
      const accountKeys = tx.message?.accountKeys || [];
      const sig = (tx.signatures && tx.signatures[0]) || tx.signature || entry.signature || null;
      if (!sig) continue;

      const fromAddr = typeof accountKeys[0] === 'string' ? accountKeys[0] : (accountKeys[0]?.pubkey || null);
      const toAddr = typeof accountKeys[1] === 'string' ? accountKeys[1] : (accountKeys[1]?.pubkey || null);

      const item = {
        signature: sig,
        blockHeight: h,
        blockTime: bTime,
        from: fromAddr,
        to: toAddr,
        instructionCount: tx.message?.instructions?.length || 0,
        fee: meta.fee ?? null,
        err: meta.err ?? null,
        status: meta.err ? 'failed' : 'success'
      };

      extracted.push(item);
      indexTransaction(entry, h, bTime);
    }
  }

  // Extract from block.signatures (lightweight signatures list)
  if (Array.isArray(block.signatures)) {
    for (const s of block.signatures) {
      const sig = typeof s === 'string' ? s : s?.signature;
      if (!sig || extracted.some(e => e.signature === sig)) continue;

      extracted.push({
        signature: sig,
        blockHeight: h,
        blockTime: bTime,
        from: null,
        to: null,
        instructionCount: 0,
        fee: null,
        err: null,
        status: 'success'
      });
    }
  }

  if (extracted.length > 0) {
    addNetworkTransactions(extracted);
  }

  return extracted;
}

/**
 * Get all indexed network transactions with pagination.
 * @param {number} offset
 * @param {number} limit
 * @returns {Array} Array of transactions sorted descending
 */
export function getNetworkTransactions(offset = 0, limit = 50) {
  initNetworkTxMap();
  const list = Array.from(networkTxMap.values());
  list.sort((a, b) => {
    const hA = Number(a.blockHeight) || 0;
    const hB = Number(b.blockHeight) || 0;
    if (hB !== hA) return hB - hA;
    const tA = Number(a.blockTime) || 0;
    const tB = Number(b.blockTime) || 0;
    return tB - tA;
  });
  return list.slice(offset, offset + limit);
}

/**
 * Get total number of unique known transactions in indexer
 */
export function getTotalKnownTransactions() {
  initNetworkTxMap();
  return networkTxMap.size;
}

/**
 * Get all known transactions for an address combining local index + RPC signatures.
 * @param {string} address - Base58 wallet or program address
 * @param {Array} rpcSignatures - Signatures returned from getSignaturesForAddress
 * @returns {Array} Deduplicated transaction objects sorted descending
 */
export function getFullAccountTransactions(address, rpcSignatures = []) {
  if (!address) return [];
  initNetworkTxMap();

  const map = new Map();

  // 1. Check if global network pool has transactions touching this address
  for (const tx of networkTxMap.values()) {
    if (tx.from === address || tx.to === address) {
      map.set(tx.signature, tx);
    }
  }

  // 2. Load cached account-specific transactions
  try {
    const stored = JSON.parse(localStorage.getItem(`rialo_txs_${address}`) || '[]');
    if (Array.isArray(stored)) {
      stored.forEach(item => {
        const sig = typeof item === 'string' ? item : item.signature;
        if (sig) {
          const prev = map.get(sig) || {};
          map.set(sig, { ...prev, ...(typeof item === 'object' ? item : { signature: sig }) });
        }
      });
    }
  } catch (e) {}

  // 3. Merge fresh RPC signatures
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
        status: item.err ? 'failed' : (existing.status || 'success'),
        fee: existing.fee ?? null
      });
    });
  }

  const allSignatures = Array.from(map.values());
  allSignatures.sort((a, b) => {
    const hA = Number(a.blockHeight) || 0;
    const hB = Number(b.blockHeight) || 0;
    if (hB !== hA) return hB - hA;
    const tA = Number(a.blockTime) || 0;
    const tB = Number(b.blockTime) || 0;
    return tB - tA;
  });

  try {
    localStorage.setItem(`rialo_txs_${address}`, JSON.stringify(allSignatures.slice(0, 1000)));
  } catch (e) {}

  return allSignatures;
}

/**
 * Register a transaction against every account key it touches
 * @param {Object} tx
 * @param {number} [height]
 * @param {number} [bTime]
 */
export function indexTransaction(tx, height = null, bTime = null) {
  if (!tx) return;
  const transaction = tx.transaction || tx;
  const meta = tx.meta || {};
  const sig = (transaction.signatures && transaction.signatures[0]) || transaction.signature || tx.signature || null;
  if (!sig) return;

  const blockHeight = height ?? tx.block_height ?? tx.blockHeight ?? null;
  const blockTime = bTime ?? tx.blockTime ?? transaction.validFrom ?? null;
  const status = meta.err ? 'failed' : 'success';
  const fee = meta.fee ?? null;

  const accounts = transaction.message?.accountKeys || [];
  for (const k of accounts) {
    const addr = typeof k === 'string' ? k : (k?.pubkey || null);
    if (!addr || addr.length < 20) continue;
    try {
      const stored = JSON.parse(localStorage.getItem(`rialo_txs_${addr}`) || '[]');
      if (!stored.some(t => t.signature === sig)) {
        stored.unshift({ signature: sig, blockHeight, blockTime, status, fee });
        localStorage.setItem(`rialo_txs_${addr}`, JSON.stringify(stored.slice(0, 500)));
      }
    } catch (e) {}
  }
}
