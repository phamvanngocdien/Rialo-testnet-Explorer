import { rpc } from '../rpc.js';
import { formatNumber, truncateHash, copyToClipboard } from '../utils.js';
import { statCardSkeleton, tableRowSkeleton } from '../components/skeleton.js';

let validatorPollTimer = null;

export async function renderValidators(container) {
  if (validatorPollTimer) {
    clearInterval(validatorPollTimer);
    validatorPollTimer = null;
  }

  container.innerHTML = `
    <div class="validators-page-view">
      <!-- Page Banner -->
      <div class="page-header-banner">
        <div class="page-breadcrumb">
          <a href="#/"><i class="fa-solid fa-house"></i> Home</a>
          <span>/</span>
          <span>Validators</span>
        </div>
        <div class="page-title-row">
          <div class="page-title">
            <i class="fa-solid fa-shield-halved text-beige"></i>
            <span>Testnet Consensus Validators</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="feed-badge success" id="val-auto-refresh-badge">
              <i class="fa-solid fa-rotate fa-spin" style="font-size: 0.7rem;"></i> Auto-refresh 8s
            </span>
            <button id="refresh-val-btn" class="btn btn-secondary btn-sm">
              <i class="fa-solid fa-rotate-right"></i> Refresh
            </button>
          </div>
        </div>
      </div>

      <!-- Validator Metrics -->
      <div class="stats-grid" id="validator-stats-grid">
        <div class="stat-card">
          <div class="stat-icon">
            <i class="fa-solid fa-server"></i>
          </div>
          <div class="stat-content">
            <span class="stat-label">Active Nodes</span>
            <span class="stat-value text-beige" id="val-active-count">—</span>
            <span class="stat-sub text-green"><i class="fa-solid fa-circle-check"></i> Online</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <i class="fa-solid fa-layer-group"></i>
          </div>
          <div class="stat-content">
            <span class="stat-label">Consensus Engine</span>
            <span class="stat-value text-beige">SubDAG BFT</span>
            <span class="stat-sub">Parallel Execution</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <i class="fa-solid fa-vault"></i>
          </div>
          <div class="stat-content">
            <span class="stat-label">Total Staked</span>
            <span class="stat-value text-beige" id="val-total-stake">—</span>
            <span class="stat-sub">Testnet Quorum</span>
          </div>
        </div>
      </div>

      <!-- Validators Table Card -->
      <div class="glass-card" id="validators-table-card">
        ${tableRowSkeleton(6, 4)}
      </div>
    </div>
  `;

  loadValidators(container);

  // Auto-refresh every 8 seconds (Item 12)
  validatorPollTimer = setInterval(() => loadValidators(container), 8000);

  container.querySelector('#refresh-val-btn')?.addEventListener('click', () => {
    loadValidators(container);
  });
}

async function loadValidators(container) {
  const card = container.querySelector('#validators-table-card');
  if (!card) return;

  try {
    const [clusterNodes, validatorAccounts] = await Promise.allSettled([
      rpc.getClusterNodes(),
      rpc.getValidatorAccounts(),
    ]);

    const nodes = clusterNodes.status === 'fulfilled' ? clusterNodes.value : [];
    const accounts = validatorAccounts.status === 'fulfilled' ? validatorAccounts.value : [];

    if (nodes.length === 0 && accounts.length === 0) {
      card.innerHTML = `
        <div style="padding: 30px; text-align: center;" class="text-muted">
          <p>No validator node information returned from RPC.</p>
        </div>
      `;
      return;
    }

    const list = nodes.length > 0 ? nodes : accounts;

    // Update stats
    const activeCountEl = container.querySelector('#val-active-count');
    const totalStakeEl = container.querySelector('#val-total-stake');
    if (activeCountEl) activeCountEl.innerText = `${list.length} / ${list.length}`;
    
    let totalStake = 0;
    list.forEach(n => { totalStake += (n.stake || 1); });
    if (totalStakeEl) totalStakeEl.innerText = `${totalStake} Stake`;

    // Find max round for progress bar calculation
    let maxRound = 0;
    list.forEach(n => {
      const round = n.lastCommittedRound || 0;
      if (round > maxRound) maxRound = round;
    });

    let rows = '';
    list.forEach((node, idx) => {
      const hostname = node.hostname || `validator-${idx}`;
      const address = node.address || 'N/A';
      const stake = node.stake !== undefined ? node.stake : 1;
      const round = node.lastCommittedRound || 0;
      const roundDisplay = round ? formatNumber(round) : 'Active';
      const authKey = node.authorityPubkey || node.authority_key || '';
      const protoKey = node.protocolPubkey || node.protocol_key || '';
      const netKey = node.networkPubkey || node.network_key || '';

      // Round progress percentage relative to max
      const progressPct = maxRound > 0 ? Math.min(100, (round / maxRound) * 100) : 100;

      rows += `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="feed-icon" style="width: 34px; height: 34px; font-size: 0.85rem;">
                <i class="fa-solid fa-server"></i>
              </div>
              <div>
                <strong class="text-beige">${hostname}</strong>
                <div class="mono text-dim" style="font-size: 0.75rem;">${address}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="feed-badge success">
              <span class="pulse-dot" style="width: 6px; height: 6px;"></span>
              Active
            </span>
          </td>
          <td class="mono"><strong>${stake}</strong></td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span class="mono text-beige">${roundDisplay}</span>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
              </div>
            </div>
          </td>
          <td class="mono">
            <span title="Protocol Key: ${protoKey}" class="copy-pill" onclick="window.copyToClip('${protoKey}', 'Protocol Key')">
              <i class="fa-solid fa-key"></i>
              <span>${truncateHash(protoKey, 6, 6)}</span>
            </span>
          </td>
          <td class="mono">
            <span title="Network Key: ${netKey}" class="copy-pill" onclick="window.copyToClip('${netKey}', 'Network Key')">
              <i class="fa-solid fa-network-wired"></i>
              <span>${truncateHash(netKey, 6, 6)}</span>
            </span>
          </td>
        </tr>
      `;
    });

    card.innerHTML = `
      <div class="table-container" style="padding: 0;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Validator Node</th>
              <th>Status</th>
              <th>Stake</th>
              <th>Last Committed Round</th>
              <th>Protocol Key</th>
              <th>Network Key</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    window.copyToClip = (text, label) => {
      copyToClipboard(text, label);
    };

  } catch (err) {
    console.error('Error loading validators:', err);
    card.innerHTML = `
      <div class="error-state" style="padding: 30px; text-align: center;">
        <i class="fa-solid fa-triangle-exclamation text-red" style="font-size: 2rem; margin-bottom: 10px;"></i>
        <p class="text-red" style="margin-bottom: 12px;">Failed to load validators: ${err.message}</p>
        <button class="btn btn-secondary btn-sm" id="val-retry-btn">
          <i class="fa-solid fa-rotate-right"></i> Retry
        </button>
      </div>
    `;
    card.querySelector('#val-retry-btn')?.addEventListener('click', () => loadValidators(container));
  }
}
