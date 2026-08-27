import { rpc, getOrCreateBlockTime } from '../rpc.js';
import { formatNumber, formatTimeAgo, formatDateTime } from '../utils.js';
import { tableRowSkeleton } from '../components/skeleton.js';

export async function renderBlocksList(container) {
  const PAGE_SIZE = 30; // Item 4: 30 blocks per page
  let currentPage = 0;
  let topHeight = 0;
  let ageInterval = null;

  container.innerHTML = `
    <div class="blocks-page-view">
      <div class="page-header-banner">
        <div class="page-breadcrumb">
          <a href="#/"><i class="fa-solid fa-house"></i> Home</a>
          <span>/</span>
          <span>Blocks</span>
        </div>
        <div class="page-title-row">
          <div class="page-title">
            <i class="fa-solid fa-cubes text-beige"></i>
            <span>Rialo Testnet Blocks</span>
          </div>
          <div>
            <button id="refresh-blocks-btn" class="btn btn-secondary btn-sm">
              <i class="fa-solid fa-rotate-right"></i> Refresh Feed
            </button>
          </div>
        </div>
      </div>

      <!-- Blocks Table Card -->
      <div class="glass-card" id="blocks-table-card">
        ${tableRowSkeleton(5, 15)}
      </div>

      <!-- Pagination Controls (Item 4: Jump-to-page input + Total Pages) -->
      <div class="pagination-bar" id="blocks-pagination">
        <div class="pagination-group">
          <button id="blocks-first-btn" class="pagination-btn" title="First Page" disabled>
            <i class="fa-solid fa-angles-left"></i>
          </button>
          <button id="blocks-prev-btn" class="pagination-btn" disabled>
            <i class="fa-solid fa-chevron-left"></i> Newer
          </button>
        </div>

        <div class="pagination-jump-container">
          <span>Page</span>
          <input type="number" id="blocks-page-input" class="pagination-jump-input" value="1" min="1" />
          <span>of <span id="blocks-total-pages">1</span></span>
        </div>

        <div class="pagination-group">
          <button id="blocks-next-btn" class="pagination-btn">
            Older <i class="fa-solid fa-chevron-right"></i>
          </button>
          <button id="blocks-last-btn" class="pagination-btn" title="Last Page">
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

  async function loadPage(page) {
    const card = container.querySelector('#blocks-table-card');
    if (!card) return;

    try {
      if (page === 0 || topHeight === 0) {
        topHeight = await rpc.getBlockHeight();
      }

      const totalPages = Math.max(1, Math.ceil(topHeight / PAGE_SIZE));
      const targetPage = Math.max(0, Math.min(page, totalPages - 1));

      const startH = topHeight - (targetPage * PAGE_SIZE);
      const endH = Math.max(0, startH - PAGE_SIZE + 1);

      const heights = [];
      for (let h = startH; h >= endH; h--) {
        heights.push(h);
      }

      if (heights.length === 0) {
        card.innerHTML = `<div style="padding: 30px; text-align: center;" class="text-muted">No more blocks</div>`;
        return;
      }

      card.innerHTML = tableRowSkeleton(5, Math.min(heights.length, 12));

      const blocks = await Promise.all(
        heights.map(h => rpc.getBlock(h).catch(() => null))
      );

      let rows = '';
      blocks.forEach((block, index) => {
        const height = heights[index];
        const txCount = block?.transactions ? block.transactions.length : 0;
        const bTime = block?.blockTime ? (block.blockTime < 10000000000 ? block.blockTime * 1000 : block.blockTime) : getOrCreateBlockTime(height);
        const timeAgo = formatTimeAgo(bTime);
        const timeFull = formatDateTime(bTime);

        rows += `
          <tr>
            <td style="width: 25%;">
              <a href="#/block/${height}" class="copy-pill" style="text-decoration: none;">
                <i class="fa-solid fa-cube text-beige"></i>
                <span>#${formatNumber(height)}</span>
              </a>
            </td>
            <td style="width: 25%;">
              <span class="live-age" data-time="${bTime}" title="${timeFull}">${timeAgo}</span>
            </td>
            <td style="width: 20%;">
              <span class="feed-badge success">
                <i class="fa-solid fa-bolt"></i> ${txCount} ${txCount === 1 ? 'tx' : 'txs'}
              </span>
            </td>
            <td style="width: 15%;">
              <span class="text-muted"><i class="fa-solid fa-circle-check text-green"></i> Finalized</span>
            </td>
            <td style="width: 15%; text-align: right;">
              <a href="#/block/${height}" class="btn btn-secondary btn-sm">
                <span>View</span> <i class="fa-solid fa-arrow-right"></i>
              </a>
            </td>
          </tr>
        `;
      });

      card.innerHTML = `
        <div class="table-container" style="padding: 0; overflow-x: auto;">
          <table class="data-table fixed-table">
            <thead>
              <tr>
                <th style="width: 25%;">Block Height</th>
                <th style="width: 25%;">Age</th>
                <th style="width: 20%;">Transactions</th>
                <th style="width: 15%;">Status</th>
                <th style="width: 15%; text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;

      currentPage = targetPage;
      updatePaginationUI(targetPage, topHeight);
      startAgeTicker();

    } catch (err) {
      console.error('Error loading blocks list:', err);
      card.innerHTML = `
        <div class="error-state" style="padding: 30px; text-align: center;">
          <i class="fa-solid fa-triangle-exclamation text-red" style="font-size: 2rem; margin-bottom: 10px;"></i>
          <p class="text-red" style="margin-bottom: 12px;">Failed to load blocks: ${err.message}</p>
          <button class="btn btn-secondary btn-sm" id="blocks-retry-btn">
            <i class="fa-solid fa-rotate-right"></i> Retry
          </button>
        </div>
      `;
      card.querySelector('#blocks-retry-btn')?.addEventListener('click', () => loadPage(page));
    }
  }

  function updatePaginationUI(page, maxHeight) {
    const totalPages = Math.max(1, Math.ceil(maxHeight / PAGE_SIZE));
    const firstBtn = container.querySelector('#blocks-first-btn');
    const prevBtn = container.querySelector('#blocks-prev-btn');
    const nextBtn = container.querySelector('#blocks-next-btn');
    const lastBtn = container.querySelector('#blocks-last-btn');
    const pageInput = container.querySelector('#blocks-page-input');
    const totalPagesEl = container.querySelector('#blocks-total-pages');

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
  const pageInput = container.querySelector('#blocks-page-input');
  if (pageInput) {
    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const totalPages = Math.max(1, Math.ceil(topHeight / PAGE_SIZE));
        let p = parseInt(pageInput.value, 10);
        if (isNaN(p) || p < 1) p = 1;
        if (p > totalPages) p = totalPages;
        loadPage(p - 1);
      }
    });

    pageInput.addEventListener('change', () => {
      const totalPages = Math.max(1, Math.ceil(topHeight / PAGE_SIZE));
      let p = parseInt(pageInput.value, 10);
      if (isNaN(p) || p < 1) p = 1;
      if (p > totalPages) p = totalPages;
      loadPage(p - 1);
    });
  }

  // Event listeners
  container.querySelector('#refresh-blocks-btn')?.addEventListener('click', () => {
    topHeight = 0;
    loadPage(0);
  });

  container.querySelector('#blocks-first-btn')?.addEventListener('click', () => {
    loadPage(0);
  });

  container.querySelector('#blocks-prev-btn')?.addEventListener('click', () => {
    if (currentPage > 0) loadPage(currentPage - 1);
  });

  container.querySelector('#blocks-next-btn')?.addEventListener('click', () => {
    loadPage(currentPage + 1);
  });

  container.querySelector('#blocks-last-btn')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(topHeight / PAGE_SIZE));
    loadPage(totalPages - 1);
  });

  // Initial load
  loadPage(0);
}
