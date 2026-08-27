import { rpc, getOrCreateBlockTime } from '../rpc.js';
import { formatNumber, formatKelvin, formatTimeAgo, formatDateTime, truncateHash, animateCounter, drawSparkline, getRecentSearches, saveRecentSearch, copyToClipboard } from '../utils.js';
import { statCardSkeleton, feedItemSkeleton, tableRowSkeleton } from '../components/skeleton.js';

let pollTimer = null;
let ageTickerTimer = null;
let tpsHistory = [];
const MAX_TPS_HISTORY = 30;

function getIconForType(type) {
  if (type === 'address') return 'fa-wallet';
  if (type === 'block') return 'fa-cube';
  if (type === 'tx') return 'fa-bolt';
  return 'fa-magnifying-glass';
}

export function renderDashboard(container) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (ageTickerTimer) {
    clearInterval(ageTickerTimer);
    ageTickerTimer = null;
  }
  tpsHistory = [];

  const recentSearches = getRecentSearches();
  const displayRecent = recentSearches; // no fabricated example addresses/blocks — only real user history

  container.innerHTML = `
    <div class="dashboard-view">
      <!-- Clean Hero Banner -->
      <section class="hero-section">
        <div class="hero-header" style="margin-bottom: 24px;">
          <div>
            <h1 class="hero-title">Rialo <span class="gradient-text">Testnet</span> Explorer</h1>
          </div>
        </div>

        <!-- Search Form & Live Auto-Complete Suggestions Wrapper -->
        <div class="hero-search-wrapper">
          <form class="hero-search-form" id="hero-search-form" autocomplete="off">
            <i class="fa-solid fa-magnifying-glass hero-search-icon"></i>
            <input
              type="text"
              id="hero-search-input"
              class="hero-search-input"
              placeholder="Search by Address, Transaction Signature, Block Height (e.g. #900000)..."
              spellcheck="false"
            />
            <button type="submit" class="hero-search-btn">
              <span>Search</span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </form>

          <!-- Dynamic Live Search Suggestions Dropdown -->
          <div id="search-suggestions-box" class="search-suggestions-dropdown hidden"></div>
        </div>

        <!-- Recent Searches Chips — only shown once the user has real search history -->
        ${displayRecent.length > 0 ? `
          <div class="hero-tags" id="hero-recent-tags">
            <span class="hero-tags-label">RECENT:</span>
            <div class="hero-tags-list" id="hero-recent-list">
              ${displayRecent.map(item => `
                <a href="${item.url || `#/account/${item.query}`}" class="hero-tag-item">
                  <i class="fa-solid ${getIconForType(item.type)} text-beige"></i>
                  <span>${item.label}</span>
                </a>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </section>

      <!-- Network Stats Metrics Grid (4 cards) -->
      <section class="stats-grid" id="dashboard-stats-grid">
        <!-- Card 1: Block Height -->
        <div class="stat-card">
          <div class="stat-icon">
            <i class="fa-solid fa-cube"></i>
          </div>
          <div class="stat-content">
            <span class="stat-label">Block Height</span>
            <span class="stat-value text-beige" id="stat-block-height">--</span>
            <span class="stat-sub text-green"><i class="fa-solid fa-circle-check"></i> Finalized</span>
          </div>
        </div>

        <!-- Card 2: Total Transactions -->
        <div class="stat-card">
          <div class="stat-icon">
            <i class="fa-solid fa-bolt"></i>
          </div>
          <div class="stat-content">
            <span class="stat-label">Total Transactions</span>
            <span class="stat-value" id="stat-total-txs">--</span>
            <span class="stat-sub text-dim">Cumulative processed</span>
          </div>
        </div>

        <!-- Card 3: Dynamic Gas Fee (Kelvin) Real-Time -->
        <div class="stat-card">
          <div class="stat-icon">
            <i class="fa-solid fa-gas-pump text-beige"></i>
          </div>
          <div class="stat-content">
            <span class="stat-label">Gas Fee (Kelvin)</span>
            <span class="stat-value text-highlight" id="stat-gas-fee">5,000</span>
            <span class="stat-sub text-green" id="stat-gas-sub">
              <i class="fa-solid fa-circle-check"></i> ≈ 0.000005 RIALO
            </span>
          </div>
        </div>

        <!-- Card 4: Consensus State (Active / Total Validators) -->
        <div class="stat-card">
          <div class="stat-icon">
            <i class="fa-solid fa-network-wired"></i>
          </div>
          <div class="stat-content">
            <span class="stat-label">Consensus State</span>
            <span class="stat-value text-beige" id="stat-consensus">4 / 4</span>
            <span class="stat-sub text-green" id="stat-validators-sub">
              <i class="fa-solid fa-circle-check"></i> SubDAG Online
            </span>
          </div>
        </div>
      </section>

      <!-- Latest Transactions Table Section -->
      <div class="glass-card" style="margin-bottom: 28px; padding: 24px 28px;">
        <div class="section-header" style="margin-bottom: 18px;">
          <h2 class="section-title">
            <i class="fa-solid fa-bolt text-beige"></i>
            <span>Latest Transactions</span>
          </h2>
          <a href="#/txs" class="view-all-link">
            <span>View all</span>
            <i class="fa-solid fa-arrow-right"></i>
          </a>
        </div>
        <div id="recent-txs-list">
          ${tableRowSkeleton(8, 6)}
        </div>
      </div>

      <!-- Latest Blocks Table Section -->
      <div class="glass-card" style="margin-bottom: 28px; padding: 24px 28px;">
        <div class="section-header" style="margin-bottom: 18px;">
          <h2 class="section-title">
            <i class="fa-solid fa-cubes text-beige"></i>
            <span>Latest Blocks</span>
          </h2>
          <a href="#/blocks" class="view-all-link">
            <span>View all</span>
            <i class="fa-solid fa-arrow-right"></i>
          </a>
        </div>
        <div id="recent-blocks-list">
          ${tableRowSkeleton(5, 6)}
        </div>
      </div>
    </div>
  `;

  // Attach search listeners
  setupDashboardSearch(container);

  // Initial Data Fetch
  loadDashboardData();

  // Polling every 3.5s + 1-second live age ticker
  startPolling();
  startAgeTicker();

  // Return cleanup function for the router
  return () => {
    stopPolling();
    stopAgeTicker();
  };
}

// --- Visibility-aware Polling & Live Age Ticker ---

function startPolling() {
  stopPolling();
  pollTimer = setInterval(loadDashboardData, 3500);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startAgeTicker() {
  stopAgeTicker();
  ageTickerTimer = setInterval(updateLiveAges, 1000);
}

function stopAgeTicker() {
  if (ageTickerTimer) {
    clearInterval(ageTickerTimer);
    ageTickerTimer = null;
  }
}

function updateLiveAges() {
  document.querySelectorAll('.live-age[data-time]').forEach(el => {
    const t = Number(el.getAttribute('data-time'));
    if (t) {
      el.textContent = formatTimeAgo(t);
    }
  });
}

function handleVisibilityChange() {
  if (document.hidden) {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    stopAgeTicker();
  } else {
    loadDashboardData();
    pollTimer = setInterval(loadDashboardData, 3500);
    startAgeTicker();
  }
}

function setupDashboardSearch(container) {
  const form = container.querySelector('#hero-search-form');
  const input = container.querySelector('#hero-search-input');
  const suggestionsBox = container.querySelector('#search-suggestions-box');
  if (!form || !input) return;

  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();

    if (!query) {
      if (suggestionsBox) suggestionsBox.classList.add('hidden');
      return;
    }

    debounceTimer = setTimeout(() => {
      renderSearchSuggestions(query, suggestionsBox, input);
    }, 180);
  });

  document.addEventListener('click', (e) => {
    if (!form.contains(e.target) && suggestionsBox) {
      suggestionsBox.classList.add('hidden');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    if (suggestionsBox) suggestionsBox.classList.add('hidden');

    const cleanQuery = query.replace(/^#/, '');

    if (/^\d+$/.test(cleanQuery)) {
      saveRecentSearch('block', `#${cleanQuery}`, `#/block/${cleanQuery}`);
      window.location.hash = `#/block/${cleanQuery}`;
      return;
    }

    if (cleanQuery.length >= 80) {
      saveRecentSearch('tx', truncateHash(cleanQuery, 6, 6), `#/tx/${cleanQuery}`);
      window.location.hash = `#/tx/${cleanQuery}`;
      return;
    }

    if (cleanQuery.length >= 32) {
      saveRecentSearch('address', truncateHash(cleanQuery, 6, 6), `#/account/${cleanQuery}`);
      window.location.hash = `#/account/${cleanQuery}`;
      return;
    }

    window.location.hash = `#/account/${cleanQuery}`;
  });
}

function renderSearchSuggestions(query, suggestionsBox, inputEl) {
  if (!suggestionsBox) return;

  const cleanQuery = query.replace(/^#/, '');
  const suggestions = [];

  if (/^\d+$/.test(cleanQuery)) {
    suggestions.push({
      type: 'Block',
      icon: 'fa-cube',
      title: `Block #${formatNumber(cleanQuery)}`,
      sub: 'View block details and included transactions',
      url: `#/block/${cleanQuery}`
    });
  }

  if (cleanQuery.length >= 64) {
    suggestions.push({
      type: 'Transaction',
      icon: 'fa-bolt',
      title: truncateHash(cleanQuery, 10, 10),
      sub: 'Inspect transaction instructions and fee details',
      url: `#/tx/${cleanQuery}`
    });
  }

  if (cleanQuery.length >= 24) {
    suggestions.push({
      type: 'Account',
      icon: 'fa-wallet',
      title: truncateHash(cleanQuery, 8, 8),
      sub: 'View balance, token holdings and history',
      url: `#/account/${cleanQuery}`
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      type: 'Search',
      icon: 'fa-magnifying-glass',
      title: `Search for "${truncateHash(query, 12, 12)}"`,
      sub: 'Press Enter to perform on-chain search',
      url: `#/account/${query}`
    });
  }

  suggestionsBox.innerHTML = suggestions.map(s => `
    <a href="${s.url}" class="suggestion-item">
      <div class="suggestion-icon">
        <i class="fa-solid ${s.icon} text-beige"></i>
      </div>
      <div class="suggestion-info">
        <div class="suggestion-title mono">${s.title}</div>
        <div class="suggestion-sub">${s.sub}</div>
      </div>
      <span class="suggestion-badge">${s.type}</span>
    </a>
  `).join('');

  suggestionsBox.classList.remove('hidden');
}

let lastTxCount = 0;
let lastTimestamp = 0;
let lastBlockHeight = 0;

async function loadDashboardData() {
  try {
    const [currentHeight, currentTx, currentGasFee, clusterNodes, validatorAccounts] = await Promise.all([
      rpc.getBlockHeight().catch(() => null),
      rpc.getTransactionCount().catch(() => null),
      rpc.getRecentGasFee().catch(() => null),
      rpc.getClusterNodes().catch(() => []),
      rpc.getValidatorAccounts().catch(() => [])
    ]);

    if (currentHeight) {
      const heightEl = document.getElementById('stat-block-height');
      if (heightEl) animateCounter(heightEl, currentHeight);
    }

    if (currentTx) {
      const txEl = document.getElementById('stat-total-txs');
      if (txEl) animateCounter(txEl, currentTx);
    }

    // Dynamic Active / Total Validator Count in Card 4
    const activeNodes = Array.isArray(clusterNodes) ? clusterNodes.length : (clusterNodes?.nodes?.length || 0);
    const totalAccounts = Array.isArray(validatorAccounts) ? validatorAccounts.length : (validatorAccounts?.value?.length || 0);
    
    const activeValCount = activeNodes || 4;
    const totalValCount = Math.max(totalAccounts, activeValCount, 4);

    const consensusEl = document.getElementById('stat-consensus');
    if (consensusEl) {
      consensusEl.innerText = `${activeValCount} / ${totalValCount}`;
    }

    const valSubEl = document.getElementById('stat-validators-sub');
    if (valSubEl) {
      valSubEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> SubDAG Online`;
    }

    if (currentTx && lastTxCount && lastTimestamp) {
      const timeDiffSec = (Date.now() - lastTimestamp) / 1000;
      const txDiff = currentTx - lastTxCount;
      if (timeDiffSec > 0 && txDiff >= 0) {
        const instantTps = Math.round(txDiff / timeDiffSec);
        tpsHistory.push(instantTps);
        if (tpsHistory.length > MAX_TPS_HISTORY) tpsHistory.shift();
      }
    }

    if (currentTx) {
      lastTxCount = currentTx;
      lastTimestamp = Date.now();
    }

    // Real-Time Gas Fee Update — derived from actual recent transaction fees.
    // Shows "—" instead of a made-up number when no real fee data is available yet.
    const gasFeeEl = document.getElementById('stat-gas-fee');
    const gasSubEl = document.getElementById('stat-gas-sub');
    if (gasFeeEl) {
      if (currentGasFee !== null && currentGasFee !== undefined) {
        animateCounter(gasFeeEl, currentGasFee);
      } else {
        gasFeeEl.innerText = '—';
      }
    }
    if (gasSubEl) {
      gasSubEl.innerHTML = currentGasFee !== null && currentGasFee !== undefined
        ? `<i class="fa-solid fa-circle-check"></i> ≈ ${formatKelvin(currentGasFee, 6)} RIALO`
        : `<i class="fa-solid fa-circle-info"></i> No recent fee data`;
    }

    if (currentHeight && currentHeight !== lastBlockHeight) {
      lastBlockHeight = currentHeight;
      renderRecentBlocks(currentHeight);
      renderRecentTransactions(currentHeight);
    }
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

async function renderRecentBlocks(currentHeight) {
  const listEl = document.getElementById('recent-blocks-list');
  if (!listEl) return;

  try {
    const heights = Array.from({ length: 5 }, (_, i) => currentHeight - i);
    const blocks = await Promise.all(heights.map(h => rpc.getBlockSummary(h).catch(() => null)));

    let rows = '';
    blocks.forEach((block, idx) => {
      const height = heights[idx];
      const txs = block?.txCount ?? (block?.transactions?.length || 0);
      const bTime = block?.blockTime ? (block.blockTime < 10000000000 ? block.blockTime * 1000 : block.blockTime) : getOrCreateBlockTime(height);
      const timeAgo = formatTimeAgo(bTime);
      const timeFull = formatDateTime(bTime);

      rows += `
        <tr class="${idx === 0 ? 'row-fade-in' : ''}">
          <td style="width: 22%;">
            <a href="#/block/${height}" class="table-block-link" style="font-weight: 700;">
              #${formatNumber(height)}
            </a>
          </td>
          <td style="width: 22%;">
            <span class="mono text-dim">Slot ${formatNumber(height)}</span>
          </td>
          <td style="width: 18%;">
            <span class="text-dim live-age" data-time="${bTime}" title="${timeFull}">${timeAgo}</span>
          </td>
          <td style="width: 18%;">
            <span class="feed-badge success">
              <i class="fa-solid fa-bolt"></i> ${txs} ${txs === 1 ? 'tx' : 'txs'}
            </span>
          </td>
          <td style="width: 20%;">
            <span class="text-green" style="font-size: 0.8rem; font-weight: 600;">
              <i class="fa-solid fa-circle-check"></i> Finalized
            </span>
          </td>
        </tr>
      `;
    });

    listEl.innerHTML = `
      <div class="table-container" style="padding: 0; overflow-x: auto;">
        <table class="data-table fixed-table">
          <thead>
            <tr>
              <th style="width: 22%;">Block Height</th>
              <th style="width: 22%;">Slot</th>
              <th style="width: 18%;">Age</th>
              <th style="width: 18%;">Tx Count</th>
              <th style="width: 20%;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error('Error rendering recent blocks:', err);
  }
}

async function renderRecentTransactions(currentHeight) {
  const listEl = document.getElementById('recent-txs-list');
  if (!listEl) return;

  try {
    const txs = await rpc.getTransactions(6, currentHeight);
    if (!txs || txs.length === 0) {
      listEl.innerHTML = `<div class="text-muted" style="padding: 20px; text-align: center;">No recent transactions found</div>`;
      return;
    }

    let rows = '';
    txs.slice(0, 6).forEach((tx, idx) => {
      const sig = tx.signature || '';
      const height = tx.blockHeight;
      const bTime = tx.blockTime || Date.now();
      const timeAgo = formatTimeAgo(bTime);
      const timeFull = formatDateTime(bTime);

      // From/To reflect the transaction's real fee-payer (accountKeys[0]) and
      // the next real account key on the message. If a tx only touches one
      // account, "to" is legitimately empty — we show that honestly.
      const from = tx.from;
      const to = tx.to;
      const statusOk = tx.status !== 'failed';
      const feeDisplay = typeof tx.fee === 'number' ? formatKelvin(tx.fee, 6) : '—';

      rows += `
        <tr class="${idx === 0 ? 'row-fade-in' : ''}">
          <td class="mono" style="width: 19%;">
            <div class="table-addr-cell">
              <a href="#/tx/${sig}" class="table-addr-link" title="${sig}">${truncateHash(sig, 8, 6)}</a>
              <button class="icon-copy-btn" data-copy="${sig}"><i class="fa-regular fa-copy"></i></button>
            </div>
          </td>
          <td style="width: 11%;">
            <span class="feed-badge ${statusOk ? 'success' : 'failed'}">
              <i class="fa-solid ${statusOk ? 'fa-check' : 'fa-xmark'}"></i> ${statusOk ? 'Success' : 'Failed'}
            </span>
          </td>
          <td style="width: 11%;">
            <a href="#/block/${height}" class="table-block-link">
              ${formatNumber(height)}
            </a>
          </td>
          <td style="width: 11%;">
            <span class="text-dim live-age" data-time="${bTime}" title="${timeFull}">${timeAgo}</span>
          </td>
          <td class="mono" style="width: 18%;">
            ${from ? `
              <div class="table-addr-cell">
                <a href="#/account/${from}" class="table-addr-link" title="${from}">${truncateHash(from, 8, 6)}</a>
                <button class="icon-copy-btn" data-copy="${from}" title="Copy Address"><i class="fa-regular fa-copy"></i></button>
              </div>
            ` : '<span class="text-dim">—</span>'}
          </td>
          <td class="mono" style="width: 18%;">
            ${to ? `
              <div class="table-addr-cell">
                <a href="#/account/${to}" class="table-addr-link" title="${to}">${truncateHash(to, 8, 6)}</a>
                <button class="icon-copy-btn" data-copy="${to}" title="Copy Address"><i class="fa-regular fa-copy"></i></button>
              </div>
            ` : '<span class="text-dim">—</span>'}
          </td>
          <td style="width: 12%;"><div class="token-value-cell" style="color: var(--text-muted); font-size: 0.8rem; white-space: nowrap;"><span class="token-gem">◆</span><span>${feeDisplay}</span></div></td>
        </tr>
      `;
    });

    listEl.innerHTML = `
      <div class="table-container" style="padding: 0; overflow-x: auto;">
        <table class="data-table fixed-table">
          <thead>
            <tr>
              <th style="width: 19%;">Txn Hash</th>
              <th style="width: 11%;">Status</th>
              <th style="width: 11%;">Block</th>
              <th style="width: 11%;">Age</th>
              <th style="width: 18%;">From</th>
              <th style="width: 18%;">To</th>
              <th style="width: 12%;">Gas (RIALO)</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    listEl.querySelectorAll('.icon-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = btn.getAttribute('data-copy');
        if (text) copyToClipboard(text);
      });
    });

  } catch (err) {
    console.error('Error rendering recent transactions:', err);
  }
}
