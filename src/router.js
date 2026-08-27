import { renderDashboard } from './pages/dashboard.js';
import { renderBlock } from './pages/block.js';
import { renderBlocksList } from './pages/blocks.js';
import { renderTransaction } from './pages/transaction.js';
import { renderTransactionsList } from './pages/transactions.js';
import { renderAccount } from './pages/account.js';
import { renderValidators } from './pages/validators.js';
import { detectQueryType, showToast, truncateHash } from './utils.js';

const SITE_TITLE = 'Rialo Explorer';

export class Router {
  constructor(appContainer) {
    this.container = appContainer;
    this._currentCleanup = null; // cleanup function for current page
    window.addEventListener('hashchange', () => this.handleRoute());
  }

  init() {
    this.handleRoute();
  }

  /**
   * Cleanup previous page (clear intervals, listeners, etc.)
   */
  _cleanup() {
    if (typeof this._currentCleanup === 'function') {
      try { this._currentCleanup(); } catch (e) { /* ignore */ }
      this._currentCleanup = null;
    }
  }

  /**
   * Apply page enter transition animation
   */
  _animatePageEnter() {
    this.container.classList.remove('page-enter');
    // Force reflow to restart animation
    void this.container.offsetWidth;
    this.container.classList.add('page-enter');
  }

  /**
   * Set document title dynamically
   * @param {string} pageTitle
   */
  _setTitle(pageTitle) {
    document.title = pageTitle ? `${pageTitle} — ${SITE_TITLE}` : SITE_TITLE;
  }

  handleRoute() {
    const rawHash = window.location.hash || '#/';
    const path = rawHash.replace(/^#\/?/, '').split('?')[0];
    const segments = path.split('/').filter(Boolean);

    // Cleanup previous page
    this._cleanup();

    // Update active state in Navigation Links
    this.updateActiveNav(segments[0] || 'dashboard');

    // Scroll to top on navigation
    window.scrollTo(0, 0);

    // Trigger page transition animation
    this._animatePageEnter();

    // Route matching
    if (segments.length === 0 || segments[0] === 'dashboard') {
      this._setTitle('Dashboard');
      const cleanup = renderDashboard(this.container);
      if (typeof cleanup === 'function') this._currentCleanup = cleanup;
      return;
    }

    const root = segments[0].toLowerCase();
    const param = segments[1] ? decodeURIComponent(segments[1]) : '';

    switch (root) {
      case 'blocks':
        this._setTitle('Blocks');
        renderBlocksList(this.container);
        break;

      case 'block':
        if (param) {
          this._setTitle(`Block #${Number(param).toLocaleString('en-US')}`);
          renderBlock(this.container, param);
        } else {
          this._setTitle('Blocks');
          renderBlocksList(this.container);
        }
        break;

      case 'txs':
      case 'transactions':
        this._setTitle('Transactions');
        renderTransactionsList(this.container);
        break;

      case 'tx':
      case 'transaction':
        if (param) {
          this._setTitle(`Tx ${truncateHash(param, 6, 6)}`);
          renderTransaction(this.container, param);
        } else {
          this._setTitle('Transactions');
          renderTransactionsList(this.container);
        }
        break;

      case 'account':
      case 'address':
        if (param) {
          this._setTitle(`Account ${truncateHash(param, 6, 6)}`);
          renderAccount(this.container, param);
        } else {
          window.location.hash = '#/';
        }
        break;

      case 'validators':
      case 'nodes':
        this._setTitle('Validators');
        renderValidators(this.container);
        break;

      case 'search':
        this.handleSearchRoute(param);
        break;

      default:
        this._setTitle('Page Not Found');
        this.render404(rawHash);
        break;
    }
  }

  handleSearchRoute(rawQuery) {
    if (!rawQuery) {
      window.location.hash = '#/';
      return;
    }

    const query = rawQuery.trim();
    const clean = query.replace(/^#/, '').replace(/,/g, '').trim();
    const type = detectQueryType(query);

    if (type === 'block') {
      window.location.hash = `#/block/${clean}`;
    } else if (type === 'tx') {
      window.location.hash = `#/tx/${clean}`;
    } else if (type === 'address') {
      window.location.hash = `#/account/${clean}`;
    } else {
      if (clean.length >= 25 && clean.length < 60) {
        window.location.hash = `#/account/${clean}`;
      } else if (clean.length >= 60) {
        window.location.hash = `#/tx/${clean}`;
      } else {
        showToast(`Could not recognize search format for: "${query}"`, 'error');
        this.render404(query);
      }
    }
  }

  updateActiveNav(activeRoute) {
    const navItems = document.querySelectorAll('.nav-item, .mobile-nav-link');
    navItems.forEach(item => {
      const route = item.getAttribute('data-route');
      if (route === activeRoute) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  render404(path) {
    this.container.innerHTML = `
      <div class="glass-card text-center" style="padding: 60px 20px; text-align: center; max-width: 600px; margin: 40px auto;">
        <i class="fa-solid fa-compass text-beige" style="font-size: 3.5rem; margin-bottom: 16px;"></i>
        <h1 style="font-size: 1.8rem; margin-bottom: 8px;">Page Not Found</h1>
        <p class="text-muted" style="margin-bottom: 24px;">The path <code>${path}</code> does not exist on Rialo Explorer.</p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <a href="#/" class="btn btn-primary"><i class="fa-solid fa-house"></i> Go to Dashboard</a>
          <a href="#/blocks" class="btn btn-secondary"><i class="fa-solid fa-cubes"></i> View Blocks</a>
        </div>
      </div>
    `;
  }
}
