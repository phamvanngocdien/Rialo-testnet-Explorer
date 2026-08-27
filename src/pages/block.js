import { rpc, getOrCreateBlockTime } from '../rpc.js';
import { formatNumber, formatKelvin, formatDateTime, formatTimeAgo, truncateHash, copyToClipboard } from '../utils.js';
import { pageHeaderSkeleton, detailGridSkeleton, tableRowSkeleton } from '../components/skeleton.js';

export async function renderBlock(container, blockHeight) {
  const height = Number(blockHeight);
  let tickerTimer = null;

  container.innerHTML = `
    <div class="block-detail-view">
      ${pageHeaderSkeleton()}
      ${detailGridSkeleton(4)}
      ${tableRowSkeleton(8, 4)}
    </div>
  `;

  try {
    const block = await rpc.getBlock(height);

    if (!block) {
      container.innerHTML = `
        <div class="glass-card text-center" style="padding: 60px 20px; text-align: center;">
          <i class="fa-solid fa-cube text-muted" style="font-size: 3rem; margin-bottom: 16px;"></i>
          <h2>Block Not Found</h2>
          <p class="text-muted" style="margin-top: 8px;">Block #${formatNumber(height)} could not be found or has not been finalized yet.</p>
          <div style="margin-top: 24px;">
            <a href="#/blocks" class="btn btn-secondary"><i class="fa-solid fa-arrow-left"></i> Back to Blocks</a>
          </div>
        </div>
      `;
      return;
    }

    const txCount = block.transactions ? block.transactions.length : 0;
    const bTime = block.blockTime ? (block.blockTime < 10000000000 ? block.blockTime * 1000 : block.blockTime) : getOrCreateBlockTime(height);
    const timeFormatted = formatDateTime(bTime);
    const timeAgo = formatTimeAgo(bTime);

    container.innerHTML = `
      <div class="block-detail-view">
        <!-- Header Banner with Prev / Next Navigation -->
        <div class="page-header-banner">
          <div class="page-breadcrumb">
            <a href="#/"><i class="fa-solid fa-house"></i> Home</a>
            <span>/</span>
            <a href="#/blocks">Blocks</a>
            <span>/</span>
            <span>#${formatNumber(height)}</span>
          </div>

          <div class="page-title-row">
            <div class="page-title">
              <i class="fa-solid fa-cube text-beige"></i>
              <span>Block #${formatNumber(height)}</span>
              <span class="page-title-badge feed-badge success">Finalized</span>
            </div>

            <!-- Block Navigation -->
            <div class="block-nav-buttons" style="display: flex; gap: 8px;">
              ${height > 0 ? `
                <a href="#/block/${height - 1}" class="btn btn-secondary btn-sm" title="Previous Block">
                  <i class="fa-solid fa-chevron-left"></i> Prev
                </a>
              ` : ''}
              <a href="#/block/${height + 1}" class="btn btn-secondary btn-sm" title="Next Block">
                Next <i class="fa-solid fa-chevron-right"></i>
              </a>
            </div>
          </div>
        </div>

        <!-- Detail Key-Value Rows -->
        <div class="detail-grid">
          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-hashtag text-beige"></i> Block Height</div>
            <div class="detail-value mono font-bold text-beige">#${formatNumber(height)}</div>
          </div>

          <div class="detail-row">
            <div class="detail-key"><i class="fa-regular fa-clock text-beige"></i> Timestamp</div>
            <div class="detail-value">
              <span>${timeFormatted}</span>
              ${timeAgo ? `<span class="text-dim live-age" data-time="${bTime}">(${timeAgo})</span>` : ''}
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-bolt text-beige"></i> Transactions</div>
            <div class="detail-value">
              <span class="feed-badge success">${txCount} transactions</span>
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-fingerprint text-beige"></i> Block Signatures</div>
            <div class="detail-value">
              <span class="text-muted">${block.signatures ? block.signatures.length : 0} consensus signatures verified</span>
            </div>
          </div>
        </div>

        <!-- Tabs: Transactions inside Block / Raw JSON -->
        <div class="tab-header">
          <button class="tab-btn active" id="tab-btn-txs">
            <i class="fa-solid fa-list"></i>
            <span>Transactions</span>
            <span class="tab-badge">${txCount}</span>
          </button>
          <button class="tab-btn" id="tab-btn-raw">
            <i class="fa-solid fa-code"></i>
            <span>Raw JSON</span>
          </button>
        </div>

        <!-- Tab 1: Transactions Table -->
        <div id="tab-content-txs" class="tab-content">
          ${renderBlockTransactions(block.transactions, height, bTime)}
        </div>

        <!-- Tab 2: Raw JSON Block Data -->
        <div id="tab-content-raw" class="tab-content hidden">
          <div class="code-block">${escapeHtml(JSON.stringify(block, null, 2))}</div>
        </div>
      </div>
    `;

    setupTabs(container);

    // Live age ticker on block details page
    if (tickerTimer) clearInterval(tickerTimer);
    tickerTimer = setInterval(() => {
      container.querySelectorAll('.live-age[data-time]').forEach(el => {
        const t = Number(el.getAttribute('data-time'));
        if (t) {
          const isParen = el.textContent.startsWith('(');
          const rel = formatTimeAgo(t);
          el.textContent = isParen ? `(${rel})` : rel;
        }
      });
    }, 1000);

    // Copy event listeners delegation
    container.querySelectorAll('.icon-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = btn.getAttribute('data-copy');
        if (text) copyToClipboard(text);
      });
    });

  } catch (err) {
    console.error('Error loading block:', err);
    container.innerHTML = `
      <div class="glass-card text-center" style="padding: 40px; text-align: center;">
        <i class="fa-solid fa-triangle-exclamation text-red" style="font-size: 2.5rem; margin-bottom: 12px;"></i>
        <h2>Failed to load block #${formatNumber(height)}</h2>
        <p class="text-muted" style="margin-top: 8px;">${err.message || 'RPC communication error'}</p>
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
          <button id="block-retry-btn" class="btn btn-primary btn-sm">
            <i class="fa-solid fa-rotate-right"></i> Retry
          </button>
          <a href="#/blocks" class="btn btn-secondary btn-sm"><i class="fa-solid fa-arrow-left"></i> Back to Blocks</a>
        </div>
      </div>
    `;
    container.querySelector('#block-retry-btn')?.addEventListener('click', () => renderBlock(container, blockHeight));
  }
}

function renderBlockTransactions(transactions, blockHeight, blockTime) {
  if (!transactions || transactions.length === 0) {
    return `
      <div class="glass-card text-center" style="padding: 40px; text-align: center;">
        <p class="text-muted">No user transactions in this block (system consensus slot).</p>
      </div>
    `;
  }

  let rows = '';
  transactions.forEach((txWrapper, index) => {
    const tx = txWrapper.transaction || {};
    const meta = txWrapper.meta || {};
    const sig = (tx.signatures && tx.signatures[0]) || tx.signature || `unknown-${index}`;
    const timeAgo = blockTime ? formatTimeAgo(blockTime) : 'Just now';
    const timeFull = blockTime ? formatDateTime(blockTime) : '';

    // From/To come strictly from the real accountKeys on the message.
    // A single-account transaction legitimately has no "to" — shown as "—".
    const accountKeys = tx.message?.accountKeys || [];
    const from = accountKeys[0] || '';
    const to = accountKeys[1] || '';
    const instructionCount = tx.message?.instructions?.length || 0;
    const isSuccess = !meta.err;
    const feeKelvin = typeof meta.fee === 'number' ? meta.fee : null;
    const feeFormatted = feeKelvin !== null ? formatKelvin(feeKelvin, 6) : '—';

    rows += `
      <tr>
        <td class="mono">
          <div class="table-addr-cell">
            <a href="#/tx/${sig}" class="table-addr-link" title="${sig}">
              ${truncateHash(sig, 8, 6)}
            </a>
            <button class="icon-copy-btn" data-copy="${sig}" title="Copy Txn Hash">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
        </td>
        <td>
          <span class="feed-badge ${isSuccess ? 'success' : 'failed'}">
            <i class="fa-solid ${isSuccess ? 'fa-check' : 'fa-xmark'}"></i> ${isSuccess ? 'Success' : 'Failed'}
          </span>
        </td>
        <td>
          <span class="text-dim" title="${timeFull}">${timeAgo}</span>
        </td>
        <td class="mono">
          ${from ? `
            <div class="table-addr-cell">
              <a href="#/account/${from}" class="table-addr-link" title="${from}">
                ${truncateHash(from, 8, 6)}
              </a>
              <button class="icon-copy-btn" data-copy="${from}" title="Copy Address">
                <i class="fa-regular fa-copy"></i>
              </button>
            </div>
          ` : '<span class="text-dim">—</span>'}
        </td>
        <td class="mono">
          ${to ? `
            <div class="table-addr-cell">
              <a href="#/account/${to}" class="table-addr-link" title="${to}">
                ${truncateHash(to, 8, 6)}
              </a>
              <button class="icon-copy-btn" data-copy="${to}" title="Copy Address">
                <i class="fa-regular fa-copy"></i>
              </button>
            </div>
          ` : '<span class="text-dim">—</span>'}
        </td>
        <td>
          <span class="text-dim">${instructionCount} ${instructionCount === 1 ? 'ix' : 'ixs'}</span>
        </td>
        <td>
          <div class="token-value-cell" style="color: var(--text-muted); font-size: 0.8rem;">
            <span class="token-gem">◆</span>
            <span>${feeFormatted}</span>
          </div>
        </td>
      </tr>
    `;
  });

  return `
    <div class="table-container glass-card" style="padding: 0; overflow-x: auto;">
      <table class="data-table fixed-table">
        <thead>
          <tr>
            <th style="width: 20%;">Txn Hash</th>
            <th style="width: 12%;">Status</th>
            <th style="width: 12%;">Age</th>
            <th style="width: 17%;">From</th>
            <th style="width: 17%;">To</th>
            <th style="width: 12%;">Instructions</th>
            <th style="width: 10%;">Gas</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function setupTabs(container) {
  const tabTxs = container.querySelector('#tab-btn-txs');
  const tabRaw = container.querySelector('#tab-btn-raw');
  const contentTxs = container.querySelector('#tab-content-txs');
  const contentRaw = container.querySelector('#tab-content-raw');

  tabTxs?.addEventListener('click', () => {
    tabTxs.classList.add('active');
    tabRaw.classList.remove('active');
    contentTxs.classList.remove('hidden');
    contentRaw.classList.add('hidden');
  });

  tabRaw?.addEventListener('click', () => {
    tabRaw.classList.add('active');
    tabTxs.classList.remove('active');
    contentRaw.classList.remove('hidden');
    contentTxs.classList.add('hidden');
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
