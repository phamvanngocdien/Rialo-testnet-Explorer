/**
 * Utility functions for Rialo Explorer
 */

// 1 RIALO = 1,000,000,000 kelvins (9 decimals)
export const KELVIN_PER_RIALO = 1000000000;

/**
 * Format Kelvin value to RIALO string
 * @param {number|string} kelvins
 * @param {number} decimals
 * @returns {string}
 */
export function formatKelvin(kelvins, decimals = 4) {
  if (kelvins === undefined || kelvins === null) return '0.0000';
  const num = Number(kelvins);
  if (isNaN(num)) return '0.0000';
  const rialo = num / KELVIN_PER_RIALO;
  
  if (rialo === 0) return '0';
  if (rialo < 0.0001 && rialo > 0) {
    return rialo.toFixed(8);
  }
  return rialo.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format integer numbers with commas (e.g. 1,450,290)
 * @param {number|string} num
 * @returns {string}
 */
export function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  const n = Number(num);
  if (isNaN(n)) return String(num);
  return n.toLocaleString('en-US');
}

/**
 * Truncate long hash or address
 * @param {string} hash
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
export function truncateHash(hash, start = 6, end = 6) {
  if (!hash || typeof hash !== 'string') return '';
  if (hash.length <= start + end) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
}

/**
 * Format timestamp into relative "X mins ago" string
 * @param {number} timestamp (in milliseconds or seconds)
 * @returns {string}
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Just now';
  let ms = Number(timestamp);
  // If timestamp is in seconds (<10000000000), convert to ms
  if (ms < 10000000000) ms *= 1000;
  
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - ms) / 1000));
  
  if (diffSec <= 1) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 5) {
    const remSec = diffSec % 60;
    return remSec > 0 ? `${diffMin}m ${remSec}s ago` : `${diffMin}m ago`;
  }
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

/**
 * Format timestamp into full date string (UTC & local)
 * @param {number} timestamp
 * @returns {string}
 */
export function formatDateTime(timestamp) {
  if (!timestamp) return 'Unknown';
  let ms = Number(timestamp);
  if (ms < 10000000000) ms *= 1000;
  const d = new Date(ms);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  });
}

/**
 * Copy text to clipboard with toast notification
 * @param {string} text
 * @param {string} label
 */
export async function copyToClipboard(text, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label}: ${truncateHash(text, 6, 6)}`, 'success');
  } catch (err) {
    // Fallback for older environments
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(`${label}: ${truncateHash(text, 6, 6)}`, 'success');
  }
}

/**
 * Display toast notification
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Detect query type for global search
 * @param {string} rawQuery
 * @returns {'block'|'address'|'tx'|'unknown'}
 */
export function detectQueryType(rawQuery) {
  if (!rawQuery) return 'unknown';
  const query = rawQuery.trim();
  const clean = query.replace(/^#/, '').replace(/,/g, '').trim();

  // 1. Is it a pure integer number? -> Block height
  if (/^\d+$/.test(clean)) {
    return 'block';
  }

  // 2. Base58 characters check
  const isBase58 = /^[1-9A-HJ-NP-Za-km-z]+$/.test(clean);
  if (!isBase58) return 'unknown';

  // 3. Solana/Rialo signatures are ~70 to 100 characters
  if (clean.length >= 70 && clean.length <= 100) {
    return 'tx';
  }

  // 4. Solana/Rialo addresses are ~30 to 50 characters
  if (clean.length >= 25 && clean.length <= 55) {
    return 'address';
  }

  return 'unknown';
}

/**
 * Get up to 5 most recent search queries from localStorage
 * @returns {Array<{query: string, label: string, type: string}>}
 */
export function getRecentSearches() {
  try {
    const raw = localStorage.getItem('rialo_recent_searches');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 5);
      }
    }
  } catch (e) {}

  return [];
}

/**
 * Save search query to recent searches (max 5 items, latest first)
 * Supports both saveRecentSearch(rawQuery) and saveRecentSearch(type, label, url)
 */
export function saveRecentSearch(typeOrQuery, label, url) {
  if (!typeOrQuery) return;

  let type = 'unknown';
  let query = '';
  let finalLabel = '';
  let finalUrl = '#/';

  if (label && url) {
    type = typeOrQuery;
    finalLabel = label;
    finalUrl = url;
    query = url.replace(/^#\/(block|account|tx)\//, '');
  } else {
    query = String(typeOrQuery).trim();
    type = detectQueryType(query);
    const clean = query.replace(/^#/, '').replace(/,/g, '').trim();
    if (type === 'block') {
      const num = Number(clean);
      finalLabel = clean.length > 10 ? `Block #${truncateHash(clean, 4, 4)}` : `Block #${formatNumber(num || clean)}`;
      finalUrl = `#/block/${clean}`;
    } else if (type === 'address') {
      finalLabel = `Wallet ${truncateHash(clean, 4, 4)}`;
      finalUrl = `#/account/${clean}`;
    } else if (type === 'tx') {
      finalLabel = `Tx ${truncateHash(clean, 4, 4)}`;
      finalUrl = `#/tx/${clean}`;
    } else {
      finalLabel = truncateHash(clean, 6, 6);
      finalUrl = `#/account/${clean}`;
    }
  }

  try {
    const current = getRecentSearches().filter(item => item.query !== query && item.url !== finalUrl);
    current.unshift({ query, label: finalLabel, type, url: finalUrl });
    localStorage.setItem('rialo_recent_searches', JSON.stringify(current.slice(0, 5)));
  } catch (e) {}
}

/**
 * Animate a numeric counter element from its current displayed value to a target value.
 * Creates a smooth count-up/down animation using requestAnimationFrame.
 * @param {HTMLElement} element - The DOM element to animate
 * @param {number} targetValue - The target numeric value
 * @param {Object} options - Animation options
 * @param {number} options.duration - Animation duration in ms (default: 600)
 * @param {string} options.prefix - Prefix string (default: '')
 * @param {string} options.suffix - Suffix string (default: '')
 * @param {boolean} options.format - Whether to format with commas (default: true)
 */
export function animateCounter(element, targetValue, options = {}) {
  if (!element) return;
  const {
    duration = 600,
    prefix = '',
    suffix = '',
    format = true,
  } = options;

  // Parse current displayed value
  const currentText = element.innerText.replace(/[^0-9.-]/g, '');
  const startValue = parseFloat(currentText) || 0;
  const diff = targetValue - startValue;

  // Skip animation if no change or very small diff
  if (Math.abs(diff) < 1) {
    element.innerText = `${prefix}${format ? formatNumber(targetValue) : targetValue}${suffix}`;
    return;
  }

  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic for smooth deceleration
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startValue + diff * eased);
    element.innerText = `${prefix}${format ? formatNumber(current) : current}${suffix}`;

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      // Ensure final value is exact
      element.innerText = `${prefix}${format ? formatNumber(targetValue) : targetValue}${suffix}`;
    }
  }

  requestAnimationFrame(step);
}

/**
 * Draw a sparkline mini-chart on a canvas element.
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number[]} dataPoints - Array of numeric values
 * @param {Object} options - Drawing options
 */
export function drawSparkline(canvas, dataPoints, options = {}) {
  if (!canvas || !dataPoints || dataPoints.length < 2) return;

  const ctx = canvas.getContext('2d');
  const {
    lineColor = 'rgba(237, 232, 220, 0.7)',
    fillColor = 'rgba(237, 232, 220, 0.08)',
    lineWidth = 2,
    padding = 4,
  } = options;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const min = Math.min(...dataPoints);
  const max = Math.max(...dataPoints);
  const range = max - min || 1;

  const points = dataPoints.map((val, i) => ({
    x: padding + (i / (dataPoints.length - 1)) * (w - padding * 2),
    y: padding + (1 - (val - min) / range) * (h - padding * 2),
  }));

  // Draw filled area
  ctx.beginPath();
  ctx.moveTo(points[0].x, h);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, h);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Draw line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Draw endpoint dot
  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();
}

/**
 * Execute async mapping function over array items with limited concurrency.
 * Prevents burst request spikes on RPC endpoints.
 * @param {Array} items
 * @param {number} limit
 * @param {Function} fn
 * @returns {Promise<Array>}
 */
export async function mapWithConcurrency(items, limit, fn) {
  if (!items || items.length === 0) return [];
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        results[i] = null;
      }
    }
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

