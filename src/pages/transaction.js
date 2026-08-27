import { rpc } from '../rpc.js';
import { formatKelvin, formatNumber, formatDateTime, formatTimeAgo, truncateHash, copyToClipboard } from '../utils.js';
import { pageHeaderSkeleton, detailGridSkeleton, tableRowSkeleton } from '../components/skeleton.js';

export async function renderTransaction(container, signature) {
  container.innerHTML = `
    <div class="tx-detail-view">
      ${pageHeaderSkeleton()}
      ${detailGridSkeleton(5)}
      ${tableRowSkeleton(3, 4)}
    </div>
  `;

  try {
    const txData = await rpc.getTransaction(signature);

    if (!txData) {
      container.innerHTML = `
        <div class="glass-card text-center" style="padding: 60px 20px; text-align: center;">
          <i class="fa-solid fa-bolt text-muted" style="font-size: 3rem; margin-bottom: 16px;"></i>
          <h2>Transaction Not Found</h2>
          <p class="text-muted" style="margin-top: 8px;">The transaction signature could not be found on Rialo Testnet.</p>
          <div style="margin-top: 24px;">
            <a href="#/" class="btn btn-secondary"><i class="fa-solid fa-arrow-left"></i> Back to Dashboard</a>
          </div>
        </div>
      `;
      return;
    }

    const tx = txData.transaction || {};
    const meta = txData.meta || {};
    const isSuccess = meta.err === null;
    const blockHeight = txData.block_height;
    const feeKelvin = meta.fee || 5000;
    const feeRialo = formatKelvin(feeKelvin, 6);
    const validFrom = tx.validFrom;
    const timeFormatted = validFrom ? formatDateTime(validFrom) : 'Confirmed';
    const timeAgo = validFrom ? formatTimeAgo(validFrom) : '';
    const computeUnits = meta.computeUnitsConsumed || 0;
    const accountKeys = tx.message?.accountKeys || [];
    const instructions = tx.message?.instructions || [];
    const logs = meta.logMessages || [];

    // Parse human-readable transaction actions
    const actions = parseTransactionActions(txData);

    container.innerHTML = `
      <div class="tx-detail-view">
        <!-- Breadcrumb & Header -->
        <div class="page-header-banner">
          <div class="page-breadcrumb">
            <a href="#/"><i class="fa-solid fa-house"></i> Home</a>
            <span>/</span>
            <a href="#/txs">Transactions</a>
            <span>/</span>
            <span>${truncateHash(signature, 8, 8)}</span>
          </div>

          <div class="page-title-row">
            <div class="page-title">
              <i class="fa-solid fa-bolt text-beige"></i>
              <span>Transaction Details</span>
              <span class="page-title-badge feed-badge ${isSuccess ? 'success' : 'failed'}">
                <i class="fa-solid ${isSuccess ? 'fa-check' : 'fa-xmark'}"></i>
                ${isSuccess ? 'Success' : 'Failed'}
              </span>
            </div>
            <div>
              <button id="copy-tx-sig-btn" class="btn btn-secondary btn-sm">
                <i class="fa-regular fa-copy"></i> Copy Signature
              </button>
            </div>
          </div>
        </div>

        <!-- Detail Grid Overview -->
        <div class="detail-grid">
          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-signature text-beige"></i> Signature</div>
            <div class="detail-value mono text-beige" style="font-size: 0.86rem;">
              ${signature}
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-play text-beige"></i> Transaction Action</div>
            <div class="detail-value">
              ${actions.map(act => `
                <div class="tx-action-pill" style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span class="method-badge ${act.badgeClass}">
                    <i class="fa-solid ${act.icon}" style="font-size: 0.7rem; margin-right: 4px;"></i>
                    ${escapeHtml(act.actionName)}
                  </span>
                  ${act.amountFormatted ? `
                    <span class="feed-badge success" style="font-weight: 800; font-size: 0.8rem; padding: 3px 10px; border-color: rgba(74, 222, 128, 0.4); display: inline-flex; align-items: center; gap: 5px;">
                      <i class="fa-solid fa-coins text-gold" style="font-size: 0.72rem;"></i>
                      <span>${escapeHtml(act.amountFormatted)}</span>
                    </span>
                  ` : ''}
                  <span class="text-muted" style="font-size: 0.84rem;">on</span>
                  <span class="mono text-beige" style="font-weight: 600;">${escapeHtml(act.programName)}</span>
                  ${act.fromAccount ? `
                    <span class="text-dim">from</span>
                    <a href="#/account/${act.fromAccount}" class="copy-pill" style="text-decoration: none; font-size: 0.78rem;">
                      <i class="fa-solid fa-wallet text-beige"></i>
                      <span>${truncateHash(act.fromAccount, 6, 6)}</span>
                    </a>
                  ` : ''}
                  ${act.destinationAccount ? `
                    <span class="text-dim">to</span>
                    <a href="#/account/${act.destinationAccount}" class="copy-pill" style="text-decoration: none; font-size: 0.78rem;">
                      <i class="fa-solid fa-arrow-right text-beige"></i>
                      <span>${truncateHash(act.destinationAccount, 6, 6)}</span>
                    </a>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-cube text-beige"></i> Block Height</div>
            <div class="detail-value">
              ${blockHeight ? `
                <a href="#/block/${blockHeight}" class="copy-pill" style="text-decoration: none;">
                  <i class="fa-solid fa-cube"></i> #${formatNumber(blockHeight)}
                </a>
              ` : '<span class="text-dim">Pending</span>'}
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-key"><i class="fa-regular fa-clock text-beige"></i> Timestamp</div>
            <div class="detail-value">
              <span>${timeFormatted}</span>
              ${timeAgo ? `<span class="text-dim">(${timeAgo})</span>` : ''}
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-coins text-beige"></i> Transaction Fee</div>
            <div class="detail-value">
              <strong class="text-beige">${feeRialo} $RIALO</strong>
              <span class="text-dim">(${formatNumber(feeKelvin)} kelvin)</span>
            </div>
          </div>

          <div class="detail-row">
            <div class="detail-key"><i class="fa-solid fa-microchip text-beige"></i> Compute Units</div>
            <div class="detail-value">
              <span class="mono">${formatNumber(computeUnits)} units consumed</span>
            </div>
          </div>
        </div>

        <!-- Dedicated Transaction Actions Visual Flow Card -->
        <div class="glass-card" style="margin-bottom: 26px; padding: 22px 24px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle);">
            <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--beige-light); display: flex; align-items: center; gap: 10px;">
              <i class="fa-solid fa-bolt-lightning text-beige"></i>
              <span>Transaction Action${actions.length > 1 ? 's' : ''}</span>
              <span class="feed-badge success" style="font-size: 0.72rem;">${actions.length} ${actions.length === 1 ? 'Action' : 'Actions'}</span>
            </h3>
          </div>

          <div class="tx-actions-list" style="display: flex; flex-direction: column; gap: 14px;">
            ${actions.map((act, i) => `
              <div class="tx-action-card" style="background: rgba(10, 11, 8, 0.75); border: 1px solid var(--border-card); border-radius: var(--radius-md); padding: 16px 18px;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                  <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span class="feed-badge beige font-bold" style="font-size: 0.74rem;">#${i + 1} Action</span>
                    <span class="method-badge ${act.badgeClass}" style="font-size: 0.8rem; padding: 4px 12px;">
                      <i class="fa-solid ${act.icon}" style="margin-right: 5px;"></i>
                      ${escapeHtml(act.actionName)}
                    </span>
                    ${act.amountFormatted ? `
                      <span class="feed-badge success" style="font-size: 0.82rem; padding: 4px 12px; font-weight: 800; border-color: rgba(74, 222, 128, 0.4); display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-coins text-gold"></i>
                        <span>${escapeHtml(act.amountFormatted)}</span>
                      </span>
                    ` : ''}
                  </div>
                  <span class="mono text-dim" style="font-size: 0.78rem;">
                    Program: <a href="#/account/${act.programId}" class="text-beige" style="text-decoration: none;">${truncateHash(act.programId, 8, 8)}</a>
                  </span>
                </div>

                <!-- Visual Action Flow Diagram with Token Amount -->
                <div class="tx-action-flow-container" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; background: rgba(237, 232, 220, 0.03); padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                  <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span class="text-dim" style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase;">From (Signer)</span>
                    <a href="#/account/${act.fromAccount || ''}" class="copy-pill" style="text-decoration: none; font-size: 0.82rem;">
                      <i class="fa-solid fa-wallet text-beige"></i>
                      <span>${act.fromAccount ? truncateHash(act.fromAccount, 6, 6) : 'None'}</span>
                    </a>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: center; color: var(--beige); font-size: 0.88rem;">
                    <i class="fa-solid fa-arrow-right"></i>
                  </div>

                  ${act.amountFormatted ? `
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <span class="text-dim" style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase;">Transferred Amount</span>
                      <div class="token-value-cell" style="background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.25); color: var(--green); padding: 4px 12px; border-radius: var(--radius-capsule); font-size: 0.85rem; font-weight: 800;">
                        <i class="fa-solid fa-coins text-gold" style="font-size: 0.76rem; margin-right: 4px;"></i>
                        <span>${escapeHtml(act.amountFormatted)}</span>
                      </div>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: center; color: var(--beige); font-size: 0.88rem;">
                      <i class="fa-solid fa-arrow-right"></i>
                    </div>
                  ` : `
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <span class="text-dim" style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase;">Program Executed</span>
                      <a href="#/account/${act.programId}" class="copy-pill" style="text-decoration: none; font-size: 0.82rem; border-color: rgba(237,232,220,0.3);">
                        <i class="fa-solid fa-cube text-beige"></i>
                        <span class="text-beige font-bold">${escapeHtml(act.programName)}</span>
                      </a>
                    </div>

                    ${act.destinationAccount ? `
                      <div style="display: flex; align-items: center; justify-content: center; color: var(--beige); font-size: 0.88rem;">
                        <i class="fa-solid fa-arrow-right"></i>
                      </div>
                    ` : ''}
                  `}

                  ${act.destinationAccount ? `
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <span class="text-dim" style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase;">Target / Receiver</span>
                      <a href="#/account/${act.destinationAccount}" class="copy-pill" style="text-decoration: none; font-size: 0.82rem;">
                        <i class="fa-solid fa-id-badge text-beige"></i>
                        <span>${truncateHash(act.destinationAccount, 6, 6)}</span>
                      </a>
                    </div>
                  ` : ''}
                </div>

                <!-- Natural Language Action Summary -->
                <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; display: flex; align-items: flex-start; gap: 8px;">
                  <i class="fa-solid fa-circle-info text-beige" style="font-size: 0.82rem; margin-top: 3px;"></i>
                  <span>
                    Signer <a href="#/account/${act.fromAccount}" class="mono text-beige" style="text-decoration: none; font-weight: 600;">${truncateHash(act.fromAccount, 6, 6)}</a> 
                    ${act.amountFormatted ? `transferred <strong class="text-green" style="font-size: 0.9rem;">${escapeHtml(act.amountFormatted)}</strong> to <a href="#/account/${act.destinationAccount}" class="mono text-beige" style="text-decoration: none; font-weight: 600;">${truncateHash(act.destinationAccount, 6, 6)}</a>` : `executed action <strong class="text-highlight">${escapeHtml(act.actionName)}</strong> via <a href="#/account/${act.programId}" class="mono text-beige" style="text-decoration: none; font-weight: 600;">${escapeHtml(act.programName)}</a>`}
                    ${!act.amountFormatted && act.destinationAccount ? `targeting account <a href="#/account/${act.destinationAccount}" class="mono text-beige" style="text-decoration: none; font-weight: 600;">${truncateHash(act.destinationAccount, 6, 6)}</a>` : ''}.
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Tabs: Accounts / Instructions / Logs / Raw JSON -->
        <div class="tab-header">
          <button class="tab-btn active" id="tab-btn-accounts">
            <i class="fa-solid fa-users"></i>
            <span>Account Keys</span>
            <span class="tab-badge">${accountKeys.length}</span>
          </button>
          <button class="tab-btn" id="tab-btn-instructions">
            <i class="fa-solid fa-code-branch"></i>
            <span>Instructions</span>
            <span class="tab-badge">${instructions.length}</span>
          </button>
          <button class="tab-btn" id="tab-btn-logs">
            <i class="fa-solid fa-terminal"></i>
            <span>Program Logs</span>
            <span class="tab-badge">${logs.length}</span>
          </button>
          <button class="tab-btn" id="tab-btn-raw">
            <i class="fa-solid fa-code"></i>
            <span>Raw JSON</span>
          </button>
        </div>

        <!-- Tab 1: Account Keys Table -->
        <div id="tab-content-accounts" class="tab-content">
          <div class="glass-card" style="padding: 0; overflow: hidden;">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Address</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  ${accountKeys.map((acc, i) => `
                    <tr>
                      <td class="text-dim">${i + 1}</td>
                      <td class="mono">
                        <a href="#/account/${acc}" class="copy-pill" style="text-decoration: none;">
                          <i class="fa-solid fa-wallet text-beige"></i>
                          <span>${acc}</span>
                        </a>
                      </td>
                      <td>
                        ${i === 0 ? '<span class="feed-badge success">Signer / Fee Payer</span>' : '<span class="feed-badge" style="background: rgba(237,232,220,0.06); color: var(--text-muted);">Account</span>'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Tab 2: Instructions Breakdown -->
        <div id="tab-content-instructions" class="tab-content hidden">
          <div class="glass-card">
            ${instructions.length === 0 ? '<p class="text-muted">No instructions in transaction message.</p>' : ''}
            ${instructions.map((ix, idx) => {
              const programId = accountKeys[ix.programIdIndex] || 'Unknown';
              return `
                <div class="instruction-box" style="margin-bottom: 16px; padding: 16px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-card); border-radius: var(--radius-md);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-weight: 700; color: var(--beige);">#${idx + 1} Instruction</span>
                    <span class="mono text-dim" style="font-size: 0.8rem;">Program: <a href="#/account/${programId}" class="text-beige">${truncateHash(programId, 8, 8)}</a></span>
                  </div>
                  <div style="font-size: 0.85rem; margin-bottom: 6px;">
                    <strong>Program ID:</strong> <span class="mono text-muted">${programId}</span>
                  </div>
                  <div style="font-size: 0.85rem; margin-bottom: 6px;">
                    <strong>Accounts:</strong>
                    <span class="mono text-muted">[${ix.accounts.join(', ')}]</span>
                  </div>
                  <div style="font-size: 0.85rem;">
                    <strong>Instruction Data (Raw/Base58):</strong>
                    <div class="code-block" style="margin-top: 6px; padding: 8px 12px;">${ix.data || 'Empty'}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Tab 3: Program Execution Logs -->
        <div id="tab-content-logs" class="tab-content hidden">
          <div class="glass-card">
            <div class="log-viewer">
              ${logs.length === 0 ? '<div class="text-dim">No execution log messages available.</div>' : ''}
              ${logs.map((log, i) => {
                let logClass = '';
                if (log.includes('success')) logClass = 'success';
                else if (log.includes('invoke')) logClass = 'invoke';
                else if (log.includes('failed') || log.includes('error')) logClass = 'error';

                return `
                  <div class="log-line">
                    <span class="log-num">${i + 1}</span>
                    <span class="log-text ${logClass}">${escapeHtml(log)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Tab 4: Raw JSON Tab -->
        <div id="tab-content-raw" class="tab-content hidden">
          <div class="code-block">${escapeHtml(JSON.stringify(txData, null, 2))}</div>
        </div>
      </div>
    `;

    container.querySelector('#copy-tx-sig-btn')?.addEventListener('click', () => {
      copyToClipboard(signature, 'Transaction Signature');
    });

    setupTxTabs(container);

  } catch (err) {
    console.error('Error rendering transaction:', err);
    container.innerHTML = `
      <div class="glass-card text-center" style="padding: 40px; text-align: center;">
        <i class="fa-solid fa-triangle-exclamation text-red" style="font-size: 2.5rem; margin-bottom: 12px;"></i>
        <h2>Failed to load transaction</h2>
        <p class="text-muted" style="margin-top: 8px;">${err.message || 'RPC communication error'}</p>
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
          <button id="tx-retry-btn" class="btn btn-primary btn-sm">
            <i class="fa-solid fa-rotate-right"></i> Retry
          </button>
          <a href="#/txs" class="btn btn-secondary btn-sm"><i class="fa-solid fa-arrow-left"></i> Back to Transactions</a>
        </div>
      </div>
    `;
    container.querySelector('#tx-retry-btn')?.addEventListener('click', () => renderTransaction(container, signature));
  }
}

// Base58 decoding lookup map
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Map();
for (let i = 0; i < BASE58_ALPHABET.length; i++) BASE58_MAP.set(BASE58_ALPHABET[i], i);

function decodeBase58(str) {
  if (!str || typeof str !== 'string') return new Uint8Array(0);
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const val = BASE58_MAP.get(c);
    if (val === undefined) return new Uint8Array(0);
    for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
    bytes[0] += val;
    let carry = 0;
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function parseInstructionAmount(programId, dataBase58) {
  if (!dataBase58) return null;
  const bytes = decodeBase58(dataBase58);
  if (bytes.length < 4) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // 1. System Program Transfers & Account Creations (11111111111111111111111111111111)
  if (programId === '11111111111111111111111111111111' || programId.includes('SystemProgram')) {
    const type = view.getUint32(0, true);
    if (type === 2 && bytes.length >= 12) {
      // Transfer: 4 bytes type + 8 bytes uint64 lamports/kelvins
      const low = view.getUint32(4, true);
      const high = view.getUint32(8, true);
      const kelvin = BigInt(low) + (BigInt(high) << 32n);
      const num = Number(kelvin);
      return {
        actionName: 'Transfer',
        amountKelvin: num,
        amountFormatted: formatDecimal(num / 1e9, 6) + ' RIALO',
        symbol: 'RIALO'
      };
    }
    if (type === 0 && bytes.length >= 12) {
      // CreateAccount: 4 bytes type + 8 bytes uint64 lamports/kelvins
      const low = view.getUint32(4, true);
      const high = view.getUint32(8, true);
      const kelvin = BigInt(low) + (BigInt(high) << 32n);
      const num = Number(kelvin);
      return {
        actionName: 'Create Account',
        amountKelvin: num,
        amountFormatted: formatDecimal(num / 1e9, 6) + ' RIALO',
        symbol: 'RIALO'
      };
    }
  }

  // 2. Token Program Transfer
  if (programId.includes('Token') && bytes.length >= 9) {
    const type = bytes[0];
    if ((type === 3 || type === 12) && bytes.length >= 9) {
      // Token Transfer: 1 byte type + 8 bytes uint64 amount
      const low = view.getUint32(1, true);
      const high = view.getUint32(5, true);
      const amount = BigInt(low) + (BigInt(high) << 32n);
      const num = Number(amount);
      return {
        actionName: 'Token Transfer',
        amountKelvin: num,
        amountFormatted: formatDecimal(num / 1e9, 6) + ' TOKEN',
        symbol: 'TOKEN'
      };
    }
  }

  return null;
}

function formatDecimal(val, maxDec = 6) {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDec
  });
}

/**
 * Parses on-chain transaction instruction metadata and logs into high-level Tx Actions
 */
function parseTransactionActions(txData) {
  const tx = txData?.transaction || {};
  const meta = txData?.meta || {};
  const accountKeys = tx.message?.accountKeys || [];
  const instructions = tx.message?.instructions || [];
  const logs = meta.logMessages || [];

  // Extract action names from logs (e.g. Instruction: FreezeStakes)
  const logInstructions = [];
  logs.forEach(l => {
    const match = l.match(/Instruction:\s*(.*)/i);
    if (match && match[1]) {
      logInstructions.push(match[1].trim());
    }
  });

  const actions = [];

  instructions.forEach((ix, idx) => {
    const programId = accountKeys[ix.programIdIndex] || 'Unknown Program';
    const actionName = logInstructions[idx] || (logInstructions.length === 1 ? logInstructions[0] : null);

    let programName = 'Custom Program';
    let actionType = 'Call';
    let badgeClass = 'execute';
    let icon = 'fa-code';

    if (programId.includes('TokenomicsGovernance')) {
      programName = 'Tokenomics Governance';
      actionType = 'Governance';
      badgeClass = 'stake';
      icon = 'fa-shield-halved';
    } else if (programId === '11111111111111111111111111111111' || programId.includes('SystemProgram')) {
      programName = 'System Program';
      actionType = 'System';
      badgeClass = 'transfer';
      icon = 'fa-arrow-right-arrow-left';
    } else if (programId.includes('Token') || programId.includes('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')) {
      programName = 'Token Program';
      actionType = 'Token';
      badgeClass = 'transfer';
      icon = 'fa-coins';
    } else if (programId.includes('Vote')) {
      programName = 'Vote Program';
      actionType = 'Vote';
      badgeClass = 'commit';
      icon = 'fa-check-to-slot';
    } else if (programId.includes('Stake')) {
      programName = 'Stake Program';
      actionType = 'Stake';
      badgeClass = 'stake';
      icon = 'fa-vault';
    }

    const parsedAmountInfo = parseInstructionAmount(programId, ix.data);
    const amountFormatted = parsedAmountInfo ? parsedAmountInfo.amountFormatted : null;

    const fromAccount = accountKeys[0] || null;
    const targetAccounts = (ix.accounts || []).map(accIdx => accountKeys[accIdx]).filter(Boolean);
    const destinationAccount = targetAccounts.find(acc => acc !== fromAccount && acc !== programId) || targetAccounts[1] || null;

    const formattedActionName = parsedAmountInfo?.actionName || actionName || (actionType === 'System' ? 'Transfer' : 'Execute Program');

    actions.push({
      index: idx + 1,
      programId,
      programName,
      actionName: formattedActionName,
      actionType,
      badgeClass,
      icon,
      amountFormatted,
      fromAccount,
      destinationAccount,
      targetAccounts,
      data: ix.data,
      isSuccess: !meta.err
    });
  });

  if (actions.length === 0) {
    const from = accountKeys[0] || 'Unknown';
    const to = accountKeys[1] || null;
    actions.push({
      index: 1,
      programId: accountKeys[accountKeys.length - 1] || 'System',
      programName: 'System Program',
      actionName: 'Transfer / Execution',
      actionType: 'Transfer',
      badgeClass: 'transfer',
      icon: 'fa-arrow-right-arrow-left',
      amountFormatted: null,
      fromAccount: from,
      destinationAccount: to,
      targetAccounts: accountKeys,
      data: '',
      isSuccess: !meta.err
    });
  }

  return actions;
}

function setupTxTabs(container) {
  const tabs = [
    { btn: container.querySelector('#tab-btn-accounts'), content: container.querySelector('#tab-content-accounts') },
    { btn: container.querySelector('#tab-btn-instructions'), content: container.querySelector('#tab-content-instructions') },
    { btn: container.querySelector('#tab-btn-logs'), content: container.querySelector('#tab-content-logs') },
    { btn: container.querySelector('#tab-btn-raw'), content: container.querySelector('#tab-content-raw') },
  ];

  tabs.forEach(t => {
    t.btn?.addEventListener('click', () => {
      tabs.forEach(other => {
        other.btn?.classList.remove('active');
        other.content?.classList.add('hidden');
      });
      t.btn?.classList.add('active');
      t.content?.classList.remove('hidden');
    });
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
