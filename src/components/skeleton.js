/**
 * Skeleton Loading Components for Rialo Explorer
 * Provides shimmer placeholder elements matching the actual content structure.
 */

/**
 * Generate a single skeleton line/block element
 * @param {string} width - CSS width (e.g., '60%', '120px')
 * @param {string} height - CSS height (e.g., '16px', '24px')
 * @param {string} radius - CSS border-radius (default: '6px')
 */
function skeletonBlock(width = '100%', height = '16px', radius = '6px') {
  return `<div class="skeleton-block" style="width:${width};height:${height};border-radius:${radius};"></div>`;
}

/**
 * Skeleton for a stat card (Block Height, Total Txs, Epoch, Validators)
 */
export function statCardSkeleton(count = 4) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="stat-card skeleton-card">
        <div class="stat-icon">${skeletonBlock('38px', '38px', '10px')}</div>
        <div class="stat-content">
          ${skeletonBlock('60%', '12px')}
          ${skeletonBlock('80%', '28px', '8px')}
          ${skeletonBlock('50%', '11px')}
        </div>
      </div>
    `;
  }
  return html;
}

/**
 * Skeleton for a feed item (used in Recent Blocks / Recent Transactions)
 */
export function feedItemSkeleton(count = 6) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="feed-item skeleton-card" style="pointer-events:none;">
        <div class="feed-item-left">
          <div class="feed-icon">${skeletonBlock('100%', '100%', '10px')}</div>
          <div class="feed-info">
            ${skeletonBlock('140px', '15px')}
            ${skeletonBlock('80px', '11px')}
          </div>
        </div>
        <div class="feed-item-right" style="align-items:flex-end;">
          ${skeletonBlock('70px', '22px', '20px')}
          ${skeletonBlock('55px', '11px')}
        </div>
      </div>
    `;
  }
  return html;
}

/**
 * Skeleton for a table row
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 */
export function tableRowSkeleton(cols = 5, rows = 8) {
  let thead = '<tr>';
  for (let c = 0; c < cols; c++) {
    thead += `<th>${skeletonBlock(['120px', '160px', '100px', '80px', '70px'][c % 5], '14px')}</th>`;
  }
  thead += '</tr>';

  let tbody = '';
  for (let r = 0; r < rows; r++) {
    tbody += '<tr>';
    for (let c = 0; c < cols; c++) {
      const w = ['45%', '70%', '55%', '40%', '30%'][c % 5];
      tbody += `<td>${skeletonBlock(w, '14px')}</td>`;
    }
    tbody += '</tr>';
  }

  return `
    <div class="table-container glass-card skeleton-card" style="padding:0;">
      <table class="data-table">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
}

/**
 * Skeleton for detail grid key-value rows
 */
export function detailGridSkeleton(rows = 5) {
  let html = '';
  for (let i = 0; i < rows; i++) {
    html += `
      <div class="detail-row skeleton-card">
        <div class="detail-key">${skeletonBlock('100px', '14px')}</div>
        <div class="detail-value">${skeletonBlock(`${50 + Math.random() * 40}%`, '14px')}</div>
      </div>
    `;
  }
  return `<div class="detail-grid">${html}</div>`;
}

/**
 * Skeleton for page header banner (breadcrumb + title)
 */
export function pageHeaderSkeleton() {
  return `
    <div class="page-header-banner skeleton-card">
      <div class="page-breadcrumb">
        ${skeletonBlock('200px', '14px')}
      </div>
      <div class="page-title-row" style="margin-top:12px;">
        <div class="page-title" style="gap:12px;">
          ${skeletonBlock('32px', '32px', '8px')}
          ${skeletonBlock('280px', '28px')}
          ${skeletonBlock('90px', '24px', '20px')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Full page skeleton: header + stats + detail grid
 */
export function fullPageSkeleton(type = 'detail') {
  if (type === 'detail') {
    return `
      ${pageHeaderSkeleton()}
      ${detailGridSkeleton(5)}
    `;
  }
  if (type === 'list') {
    return `
      ${pageHeaderSkeleton()}
      ${tableRowSkeleton(5, 10)}
    `;
  }
  return pageHeaderSkeleton();
}
