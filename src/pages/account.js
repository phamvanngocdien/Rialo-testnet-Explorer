import { rpc } from '../rpc.js';
import { KELVIN_PER_RIALO, formatNumber, formatTimeAgo, formatDateTime, truncateHash, copyToClipboard } from '../utils.js';
import { pageHeaderSkeleton, detailGridSkeleton, tableRowSkeleton, statCardSkeleton } from '../components/skeleton.js';
import { getFullAccountTransactions } from '../services/indexer.js';

const TX_PAGE_SIZE = 20;

function formatDecimalOnly(kelvins, maxDecimals = 6) {
  if (kelvins === undefined || kelvins === null) return '0.0000';
  const num = Number(kelvins);
  if (isNaN(num)) return '0.0000';
  const val = num / KELVIN_PER_RIALO;
  if (val === 0) return '0.0000';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });
}

export async function renderAccount(container, address) {
  container.innerHTML = `
    <div class="account-detail-view">
      ${pageHeaderSkeleton()}
      <div class="stats-grid" style="margin-bottom: 24px;">
        ${statCardSkeleton(3)}
      </div>
      ${detailGridSkeleton(3)}
      ${tableRowSkeleton(6, 5)}
    </div>
  `;

  try {
    // Fetch account info and initial page of signatures (limit 50) in parallel
    const [accountInfoRes, signaturesRes] = await Promise.allSettled([
      rpc.getAccountInfo(address),
      rpc.getSignaturesForAddress(address, 50),
    ]);

    const accountInfo = accountInfoRes.status === 'fulfilled' ? accountInfoRes.value : null;

    // Extract balance directly from accountInfo to prevent redundant RPC call, fallback only if missing
    let balanceKelvin = accountInfo ? (accountInfo.lamports ?? accountInfo.balance ?? accountInfo.kelvin ?? accountInfo.kelvins) : null;
    if (balanceKelvin === undefined || balanceKelvin === null) {
      balanceKelvin = await rpc.getBalance(address).catch(() => 0);
    }

    const balanceDisplay = formatDecimalOnly(balanceKelvin, 6);
    const rawSignatures = signaturesRes.status === 'fulfilled' ? signaturesRes.value : [];

    // Merge real cached + freshly-fetched real signatures for this account
    const allSignatures = getFullAccountTransactions(address, rawSignatures);

    const isProgram = accountInfo?.executable || false;
    const owner = accountInfo?.owner || '11111111111111111111111111111111';
    const space = accountInfo?.space || 0;

    container.innerHTML = `
      <div class="account-detail-view">
        <!-- Account Header Banner -->
        <div class="page-header-banner">
          <div class="page-breadcrumb">
            <a href="#/"><i class="fa-solid fa-house"></i> Home</a>
            <span>/</span>
            <span>Account</span>
            <span>/</span>
            <span>${truncateHash(address, 6, 6)}</span>
          </div>

          <div class="page-title-row">
            <div class="page-title" style="font-size: 1.45rem;">
              <i class="fa-solid fa-wallet text-beige"></i>
              <span class="mono">${truncateHash(address, 12, 12)}</span>
              <span class="page-title-badge feed-badge ${isProgram ? 'beige' : 'success'}">
                ${isProgram ? 'Program / Smart Contract' : 'Wallet Account'}
              </span>
            </div>

            <!-- Header Actions: Copy Address -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button id="copy-address-btn" class="btn btn-secondary btn-sm">
                <i class="fa-regular fa-copy"></i> Copy Address
              </button>
            </div>
          </div>
        </div>

        <!-- Balance & Stats Cards -->
        <div class="stats-grid" style="margin-bottom: 24px;">
          <div class="stat-card" id="balance-stat-card" style="border-color: var(--border-highlight);">
            <div class="stat-icon">
              <i class="fa-solid fa-coins"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">Total Balance</span>
              <span class="stat-value text-beige" id="account-balance-display">${balanceDisplay}</span>
              <span class="stat-sub">Available Balance</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">
              <i class="fa-solid fa-clock-rotate-left"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">Transactions</span>
              <span class="stat-value" id="account-tx-count-display">${allSignatures.length}</span>
              <span class="stat-sub">Total transactions</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">
              <i class="fa-solid fa-cube"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">Storage Space</span>
              <span class="stat-value">${space} B</span>
              <span class="stat-sub">${isProgram ? 'Executable bytecode' : 'Standard account'}</span>
            </div>
          </div>
        </div>

        <!-- Account Info Details Grid -->
        <div class="detail-grid">
          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-id-card text-beige"></i> Full Public Key</div>
            <div class="detail-value mono text-beige" style="font-size: 0.88rem;">${address}</div>
          </div>

          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-user-shield text-beige"></i> Assigned Owner</div>
            <div class="detail-value mono">
              <a href="#/account/${owner}" class="copy-pill" style="text-decoration: none;">
                ${owner === '11111111111111111111111111111111' ? 'System Program (Native)' : truncateHash(owner, 10, 10)}
              </a>
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-code text-beige"></i> Executable</div>
            <div class="detail-value">
              <span>${isProgram ? 'Yes (Program)' : 'No (Standard Account)'}</span>
            </div>
          </div>
        </div>

        <!-- Tabs: Transaction History / Raw JSON -->
        <div class="tab-header">
          <button class="tab-btn active" id="tab-btn-tx-history">
            <i class="fa-solid fa-list-check"></i>
            <span>Transaction History</span>
            <span class="tab-badge">${allSignatures.length}</span>
          </button>
          <button class="tab-btn" id="tab-btn-account-raw">
            <i class="fa-solid fa-code"></i>
            <span>Raw Account Data</span>
          </button>
        </div>

        <!-- Tab 1: Transaction History with Multi-page Pagination -->
        <div id="tab-content-tx-history" class="tab-content">
          <div id="account-tx-table-wrapper"></div>
          <div id="account-tx-pagination-wrapper"></div>
        </div>

        <!-- Tab 2: Raw Account Data -->
        <div id="tab-content-account-raw" class="tab-content hidden">
          <div class="code-block">${escapeHtml(JSON.stringify({ accountInfo, balance: balanceDisplay, totalTransactionsCount: allSignatures.length }, null, 2))}</div>
        </div>
      </div>
    `;

    container.querySelector('#copy-address-btn')?.addEventListener('click', () => {
      copyToClipboard(address, 'Account Address');
    });

    // Render Paginated Transaction History (20 tx per page)
    let currentTxPage = 0;
    renderPaginatedTxHistory(container, allSignatures, currentTxPage);

    setupAccountTabs(container);

  } catch (err) {
    console.error('Error rendering account:', err);
    container.innerHTML = `
      <div class="glass-card text-center" style="padding: 40px; text-align: center;">
        <i class="fa-solid fa-triangle-exclamation text-red" style="font-size: 2.5rem; margin-bottom: 12px;"></i>
        <h2>Failed to load account</h2>
        <p class="text-muted" style="margin-top: 8px;">${err.message || 'RPC communication error'}</p>
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
          <button id="account-retry-btn" class="btn btn-primary btn-sm">
            <i class="fa-solid fa-rotate-right"></i> Retry
          </button>
          <a href="#/" class="btn btn-secondary btn-sm"><i class="fa-solid fa-arrow-left"></i> Dashboard</a>
        </div>
      </div>
    `;
    container.querySelector('#account-retry-btn')?.addEventListener('click', () => renderAccount(container, address));
  }
}

function renderPaginatedTxHistory(container, allSignatures, page) {
  const tableWrapper = container.querySelector('#account-tx-table-wrapper');
  const paginationWrapper = container.querySelector('#account-tx-pagination-wrapper');
  if (!tableWrapper) return;

  if (!allSignatures || allSignatures.length === 0) {
    tableWrapper.innerHTML = `
      <div class="glass-card text-center" style="padding: 40px; text-align: center;">
        <p class="text-muted">No transaction history found for this address.</p>
      </div>
    `;
    if (paginationWrapper) paginationWrapper.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(allSignatures.length / TX_PAGE_SIZE);
  const startIndex = page * TX_PAGE_SIZE;
  const pageSignatures = allSignatures.slice(startIndex, startIndex + TX_PAGE_SIZE);

  let rows = '';
  pageSignatures.forEach((item, index) => {
    const sig = typeof item === 'string' ? item : (item.signature || '');
    const height = typeof item === 'object' ? item.blockHeight : '';
    const timeAgo = (typeof item === 'object' && item.blockTime) ? formatTimeAgo(item.blockTime) : 'Confirmed';
    const timeFull = (typeof item === 'object' && item.blockTime) ? formatDateTime(item.blockTime) : '';
    const rowNumber = startIndex + index + 1;

    rows += `
      <tr>
        <td class="text-dim">${rowNumber}</td>
        <td class="mono">
          <a href="#/tx/${sig}" class="copy-pill" style="text-decoration: none;">
            <i class="fa-solid fa-bolt text-beige"></i>
            <span>${truncateHash(sig, 10, 10)}</span>
          </a>
        </td>
        <td>
          ${height ? `
            <a href="#/block/${height}" class="text-beige mono" style="text-decoration: none;">
              #${formatNumber(height)}
            </a>
          ` : '<span class="text-dim">—</span>'}
        </td>
        <td>
          <span title="${timeFull}">${timeAgo}</span>
        </td>
        <td>
          <span class="feed-badge success">
            <i class="fa-solid fa-check"></i> Success
          </span>
        </td>
        <td style="text-align: right;">
          <a href="#/tx/${sig}" class="btn btn-secondary btn-sm">
            <span>Details</span> <i class="fa-solid fa-arrow-right"></i>
          </a>
        </td>
      </tr>
    `;
  });

  tableWrapper.innerHTML = `
    <div class="table-container glass-card" style="padding: 0; overflow-x: auto;">
      <table class="data-table fixed-table">
        <thead>
          <tr>
            <th style="width: 8%;">#</th>
            <th style="width: 32%;">Signature</th>
            <th style="width: 20%;">Block Height</th>
            <th style="width: 15%;">Age</th>
            <th style="width: 12%;">Status</th>
            <th style="width: 13%; text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  // Render pagination controls if multiple pages
  if (paginationWrapper) {
    if (totalPages > 1) {
      paginationWrapper.innerHTML = `
        <div class="pagination-bar" style="margin-top: 16px;">
          <div class="pagination-group">
            <button id="acct-first-btn" class="pagination-btn" title="First Page" ${page === 0 ? 'disabled' : ''}>
              <i class="fa-solid fa-angles-left"></i>
            </button>
            <button id="acct-prev-btn" class="pagination-btn" ${page === 0 ? 'disabled' : ''}>
              <i class="fa-solid fa-chevron-left"></i> Previous
            </button>
          </div>

          <div class="pagination-jump-container">
            <span>Page</span>
            <input type="number" id="acct-page-input" class="pagination-jump-input" value="${page + 1}" min="1" max="${totalPages}" />
            <span>of ${totalPages}</span>
          </div>

          <div class="pagination-group">
            <button id="acct-next-btn" class="pagination-btn" ${page + 1 >= totalPages ? 'disabled' : ''}>
              Next <i class="fa-solid fa-chevron-right"></i>
            </button>
            <button id="acct-last-btn" class="pagination-btn" title="Last Page" ${page + 1 >= totalPages ? 'disabled' : ''}>
              <i class="fa-solid fa-angles-right"></i>
            </button>
          </div>
        </div>
      `;

      paginationWrapper.querySelector('#acct-first-btn')?.addEventListener('click', () => {
        renderPaginatedTxHistory(container, allSignatures, 0);
      });

      paginationWrapper.querySelector('#acct-prev-btn')?.addEventListener('click', () => {
        if (page > 0) renderPaginatedTxHistory(container, allSignatures, page - 1);
      });

      paginationWrapper.querySelector('#acct-next-btn')?.addEventListener('click', () => {
        if (page + 1 < totalPages) renderPaginatedTxHistory(container, allSignatures, page + 1);
      });

      paginationWrapper.querySelector('#acct-last-btn')?.addEventListener('click', () => {
        renderPaginatedTxHistory(container, allSignatures, totalPages - 1);
      });

      const acctInput = paginationWrapper.querySelector('#acct-page-input');
      if (acctInput) {
        acctInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            let p = parseInt(acctInput.value, 10);
            if (isNaN(p) || p < 1) p = 1;
            if (p > totalPages) p = totalPages;
            renderPaginatedTxHistory(container, allSignatures, p - 1);
          }
        });

        acctInput.addEventListener('change', () => {
          let p = parseInt(acctInput.value, 10);
          if (isNaN(p) || p < 1) p = 1;
          if (p > totalPages) p = totalPages;
          renderPaginatedTxHistory(container, allSignatures, p - 1);
        });
      }
    } else {
      paginationWrapper.innerHTML = '';
    }
  }
}

function setupAccountTabs(container) {
  const tabHistory = container.querySelector('#tab-btn-tx-history');
  const tabRaw = container.querySelector('#tab-btn-account-raw');
  const contentHistory = container.querySelector('#tab-content-tx-history');
  const contentRaw = container.querySelector('#tab-content-account-raw');

  tabHistory?.addEventListener('click', () => {
    tabHistory.classList.add('active');
    tabRaw.classList.remove('active');
    contentHistory.classList.remove('hidden');
    contentRaw.classList.add('hidden');
  });

  tabRaw?.addEventListener('click', () => {
    tabRaw.classList.add('active');
    tabHistory.classList.remove('active');
    contentRaw.classList.remove('hidden');
    contentHistory.classList.add('hidden');
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
