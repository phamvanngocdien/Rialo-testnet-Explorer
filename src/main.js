import { Router } from './router.js';
import { rpc } from './rpc.js';
import { showToast, saveRecentSearch } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  // Initialize Router
  const router = new Router(mainContent);
  router.init();

  // Setup Global Header Search
  setupGlobalSearch();

  // Setup Mobile Nav Toggle
  setupMobileNav();

  // Setup Network Status Banner (connection health)
  setupNetworkStatusBanner();

  // Start background health & latency monitor
  startNetworkHealthMonitor();
});

function setupGlobalSearch() {
  const searchForm = document.getElementById('global-search-form');
  const searchInput = document.getElementById('global-search-input');

  searchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;
    saveRecentSearch(query);
    searchInput.value = '';
    searchInput.blur();
    window.location.hash = `#/search/${encodeURIComponent(query)}`;
  });

  const mobileSearchForm = document.getElementById('mobile-search-form');
  const mobileSearchInput = document.getElementById('mobile-search-input');

  mobileSearchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = mobileSearchInput.value.trim();
    if (!query) return;
    saveRecentSearch(query);
    mobileSearchInput.value = '';
    mobileSearchInput.blur();
    document.getElementById('mobile-nav')?.classList.add('hidden');
    window.location.hash = `#/search/${encodeURIComponent(query)}`;
  });

  // Global Keyboard Shortcut: '/' to focus search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      searchInput?.focus();
    }
  });
}

function setupMobileNav() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileNav = document.getElementById('mobile-nav');

  const closeMenu = () => {
    mobileNav?.classList.add('hidden');
    menuBtn?.setAttribute('aria-expanded', 'false');
    const icon = menuBtn?.querySelector('i');
    if (icon) {
      icon.className = 'fa-solid fa-bars';
    }
  };

  menuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = mobileNav?.classList.toggle('hidden');
    const isOpen = !isHidden;
    menuBtn.setAttribute('aria-expanded', String(isOpen));
    const icon = menuBtn.querySelector('i');
    if (icon) {
      icon.className = isOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    }
  });

  const mobileLinks = mobileNav?.querySelectorAll('.mobile-nav-link');
  mobileLinks?.forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  // Close mobile nav when clicking outside the header
  document.addEventListener('click', (e) => {
    if (!mobileNav?.contains(e.target) && !menuBtn?.contains(e.target)) {
      closeMenu();
    }
  });
}

/**
 * Network Status Banner — shows a warning when RPC is unreachable
 */
function setupNetworkStatusBanner() {
  const banner = document.getElementById('network-status-banner');
  if (!banner) return;

  // Listen to health change events from RPC client
  rpc.onHealthChange((isHealthy) => {
    if (isHealthy) {
      banner.classList.add('hidden');
      banner.classList.remove('show');
    } else {
      banner.classList.remove('hidden');
      banner.classList.add('show');
    }
  });

  // Retry button inside banner
  const retryBtn = banner.querySelector('#network-retry-btn');
  retryBtn?.addEventListener('click', async () => {
    retryBtn.disabled = true;
    retryBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reconnecting...';
    try {
      await rpc.getHealth();
      showToast('Connection restored!', 'success');
    } catch (e) {
      showToast('Still unable to reach RPC endpoint', 'error');
    } finally {
      retryBtn.disabled = false;
      retryBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Retry';
    }
  });
}

let healthCheckInterval = null;

async function startNetworkHealthMonitor() {
  const latencyEl = document.getElementById('footer-latency');
  const versionEl = document.getElementById('footer-version');

  const checkHealth = async () => {
    try {
      const start = performance.now();
      const version = await rpc.getVersion();
      const latency = Math.round(performance.now() - start);

      if (latencyEl) {
        latencyEl.innerText = `${latency} ms`;
        // Color-code latency
        latencyEl.className = latency < 200 ? 'text-green' : latency < 800 ? 'text-beige' : 'text-red';
      }
      if (versionEl && version) {
        versionEl.innerText = `RPC ${typeof version === 'string' ? version.slice(0, 7) : 'v1.0'}`;
      }
    } catch (e) {
      if (latencyEl) {
        latencyEl.innerText = 'Offline';
        latencyEl.className = 'text-red';
      }
    }
  };

  checkHealth();
  healthCheckInterval = setInterval(checkHealth, 10000);
}
