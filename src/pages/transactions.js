import { rpc, getOrCreateBlockTime } from '../rpc.js';
import { formatNumber, formatKelvin, formatTimeAgo, formatDateTime, truncateHash, copyToClipboard } from '../utils.js';
import { tableRowSkeleton } from '../components/skeleton.js';
import { getTotalKnownTransactions } from '../services/indexer.js';

export async function renderTransactionsList(container) {
  const PAGE_SIZE = 50; // Item 5: 50 transactions per page
  let currentPage = 0;
  let topHeight = 0;
  let totalTxCount = 0;
  let isLoading = false;
  let ageInterval = null;

  container.innerHTML = `
    <div class="txs-page-view">
      <div class="page-header-banner">
        <div class="page-breadcrumb">
          <a href="#/"><i class="fa-solid fa-house"></i> Home</a>
          <span>/</span>
          <span>Transactions</span>
        </div>
        <div class="page-title-row">
          <div class="page-title">
            <i class="fa-solid fa-bolt text-beige"></i>
            <span>Latest Transactions</span>
          </div>
          <div>
            <button id="refresh-txs-btn" class="btn btn-secondary btn-sm">
              <i class="fa-solid fa-rotate-right"></i> Refresh Feed
            </button>
          </div>
        </div>
      </div>

      <!-- Transactions Table Card -->
      <div class="glass-card" id="txs-table-card">
        ${tableRowSkeleton(8, 15)}
      </div>

      <!-- Pagination Controls (Item 5: Jump-to-page input + Total Pages) -->
      <div class="pagination-bar" id="txs-pagination">
        <div class="pagination-group">
          <button id="txs-first-btn" class="pagination-btn" title="First Page" disabled>
            <i class="fa-solid fa-angles-left"></i>
          </button>
          <button id="txs-prev-btn" class="pagination-btn" disabled>
            <i class="fa-solid fa-chevron-left"></i> Newer
          </button>
        </div>

        <div class="pagination-jump-container">
          <span>Page</span>
          <input type="number" id="txs-page-input" class="pagination-jump-input" value="1" min="1" />
          <span>of <span id="txs-total-pages">1</span></span>
        </div>

        <div class="pagination-group">
          <button id="txs-next-btn" class="pagination-btn">
            Older <i class="fa-solid fa-chevron-right"></i>
          </button>
          <button id="txs-last-btn" class="pagination-btn" title="Last Page">
            <i class="fa-solid fa-angles-right"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  function startAgeTicker() {
    if (ageInterval) clearInterval(ageInterval);
    ageInterval = setInterval(() => {
      container.querySelectorAll('.live-age[data-time]').forEach(el => {
        const time = parseInt(el.getAttribute('data-time'), 10);
        if (time) el.innerText = formatTimeAgo(time);
      });
    }, 1000);
  }

  function parseTxDetails(tx) {
    const sig = tx.signature || '';
    const height = tx.blockHeight;
    const bTime = tx.blockTime || getOrCreateBlockTime(height);
    const timeAgo = formatTimeAgo(bTime);
    const timeFull = formatDateTime(bTime);

    // from/to are real accountKeys[0]/[1] from the on-chain message — may be
    // empty for single-account transactions, which is shown honestly as "—".
    const from = tx.from || '';
    const to = tx.to || '';
    const isSuccess = tx.status !== 'failed';
    const fee = typeof tx.fee === 'number' ? formatKelvin(tx.fee, 6) : '—';

    return { sig, height, bTime, timeAgo, timeFull, from, to, isSuccess, fee };
  }

  async function loadPage(page) {
    const card = container.querySelector('#txs-table-card');
    if (!card || isLoading) return;
    isLoading = true;

    try {
      if (totalTxCount === 0) {
        const [h, tCount] = await Promise.all([
          rpc.getBlockHeight().catch(() => 0),
          rpc.getTransactionCount().catch(() => 0)
        ]);
        topHeight = h || 0;
        totalTxCount = tCount || 0;
      }

      card.innerHTML = tableRowSkeleton(8, 15);

      const targetPage = Math.max(0, page);
      const txs = await rpc.getTransactions(PAGE_SIZE, null, targetPage);

      const totalKnown = Math.max(totalTxCount || 0, getTotalKnownTransactions());
      const totalPages = Math.max(1, Math.ceil(totalKnown / PAGE_SIZE));

      if (!txs || txs.length === 0) {
        card.innerHTML = `
          <div style="padding: 40px; text-align: center;" class="text-muted">
            <p>No transactions found on Rialo Testnet stream.</p>
          </div>
        `;
        return;
      }

      let rows = '';
      txs.forEach((tx) => {
        const d = parseTxDetails(tx);

        rows += `
          <tr>
            <td class="mono" style="width: 19%;">
              <div class="table-addr-cell">
                <a href="#/tx/${d.sig}" class="table-addr-link" title="${d.sig}">
                  ${truncateHash(d.sig, 8, 6)}
                </a>
                <button class="icon-copy-btn" data-copy="${d.sig}" title="Copy Txn Hash">
                  <i class="fa-regular fa-copy"></i>
                </button>
              </div>
            </td>
            <td style="width: 11%;">
              <span class="feed-badge ${d.isSuccess ? 'success' : 'failed'}">
                <i class="fa-solid ${d.isSuccess ? 'fa-check' : 'fa-xmark'}"></i> ${d.isSuccess ? 'Success' : 'Failed'}
              </span>
            </td>
            <td style="width: 11%;">
              <a href="#/block/${d.height}" class="table-block-link">
                ${formatNumber(d.height)}
              </a>
            </td>
            <td style="width: 11%;">
              <span class="text-dim live-age" data-time="${d.bTime}" title="${d.timeFull}">${d.timeAgo}</span>
            </td>
            <td class="mono" style="width: 18%;">
              ${d.from ? `
                <div class="table-addr-cell">
                  <a href="#/account/${d.from}" class="table-addr-link" title="${d.from}">
                    ${truncateHash(d.from, 8, 6)}
                  </a>
                  <button class="icon-copy-btn" data-copy="${d.from}" title="Copy Address">
                    <i class="fa-regular fa-copy"></i>
                  </button>
                </div>
              ` : '<span class="text-dim">—</span>'}
            </td>
            <td class="mono" style="width: 18%;">
              ${d.to ? `
                <div class="table-addr-cell">
                  <a href="#/account/${d.to}" class="table-addr-link" title="${d.to}">
                    ${truncateHash(d.to, 8, 6)}
                  </a>
                  <button class="icon-copy-btn" data-copy="${d.to}" title="Copy Address">
                    <i class="fa-regular fa-copy"></i>
                  </button>
                </div>
              ` : '<span class="text-dim">—</span>'}
            </td>
            <td style="width: 12%;">
              <div class="token-value-cell" style="color: var(--text-muted); font-size: 0.8rem; white-space: nowrap;">
                <span class="token-gem">◆</span>
                <span>${d.fee}</span>
              </div>
            </td>
          </tr>
        `;
      });

      card.innerHTML = `
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

      // Copy click listener delegation
      card.querySelectorAll('.icon-copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = btn.getAttribute('data-copy');
          if (text) copyToClipboard(text);
        });
      });

      currentPage = targetPage;
      updatePaginationUI(targetPage, totalPages);
      startAgeTicker();

    } catch (err) {
      console.error('Error loading transactions feed:', err);
      card.innerHTML = `
        <div class="error-state" style="padding: 30px; text-align: center;">
          <i class="fa-solid fa-triangle-exclamation text-red" style="font-size: 2rem; margin-bottom: 10px;"></i>
          <p class="text-red" style="margin-bottom: 12px;">Failed to load transactions: ${err.message}</p>
          <button class="btn btn-secondary btn-sm" id="txs-retry-btn">
            <i class="fa-solid fa-rotate-right"></i> Retry
          </button>
        </div>
      `;
      card.querySelector('#txs-retry-btn')?.addEventListener('click', () => loadPage(page));
    } finally {
      isLoading = false;
    }
  }

  function updatePaginationUI(page, totalPages) {
    const firstBtn = container.querySelector('#txs-first-btn');
    const prevBtn = container.querySelector('#txs-prev-btn');
    const nextBtn = container.querySelector('#txs-next-btn');
    const lastBtn = container.querySelector('#txs-last-btn');
    const pageInput = container.querySelector('#txs-page-input');
    const totalPagesEl = container.querySelector('#txs-total-pages');

    if (totalPagesEl) totalPagesEl.innerText = formatNumber(totalPages);
    if (pageInput) {
      pageInput.value = page + 1;
      pageInput.max = totalPages;
    }

    if (firstBtn) firstBtn.disabled = page <= 0;
    if (prevBtn) prevBtn.disabled = page <= 0;
    if (nextBtn) nextBtn.disabled = page >= totalPages - 1;
    if (lastBtn) lastBtn.disabled = page >= totalPages - 1;
  }

  // Jump-to-page input event
  const pageInput = container.querySelector('#txs-page-input');
  if (pageInput) {
    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const totalKnown = Math.max(totalTxCount || 0, getTotalKnownTransactions());
        const totalPages = Math.max(1, Math.ceil(totalKnown / PAGE_SIZE));
        let p = parseInt(pageInput.value, 10);
        if (isNaN(p) || p < 1) p = 1;
        if (p > totalPages) p = totalPages;
        loadPage(p - 1);
      }
    });

    pageInput.addEventListener('change', () => {
      const totalKnown = Math.max(totalTxCount || 0, getTotalKnownTransactions());
      const totalPages = Math.max(1, Math.ceil(totalKnown / PAGE_SIZE));
      let p = parseInt(pageInput.value, 10);
      if (isNaN(p) || p < 1) p = 1;
      if (p > totalPages) p = totalPages;
      loadPage(p - 1);
    });
  }

  // Event listeners
  container.querySelector('#refresh-txs-btn')?.addEventListener('click', () => {
    totalTxCount = 0;
    loadPage(0);
  });

  container.querySelector('#txs-first-btn')?.addEventListener('click', () => {
    loadPage(0);
  });

  container.querySelector('#txs-prev-btn')?.addEventListener('click', () => {
    if (currentPage > 0) loadPage(currentPage - 1);
  });

  container.querySelector('#txs-next-btn')?.addEventListener('click', () => {
    loadPage(currentPage + 1);
  });

  container.querySelector('#txs-last-btn')?.addEventListener('click', () => {
    const totalKnown = Math.max(totalTxCount || 0, getTotalKnownTransactions());
    const totalPages = Math.max(1, Math.ceil(totalKnown / PAGE_SIZE));
    loadPage(totalPages - 1);
  });

  // Initial load
  loadPage(0);
}
