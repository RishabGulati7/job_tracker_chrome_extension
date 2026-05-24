// settings.js — Sheet switcher panel

import { getConfig, clearConfig } from './storage.js';
import { renderStep3B } from './onboarding.js';
import { createSheet } from './sheets.js';
import { setConfig } from './storage.js';

export async function renderSettings(container, onBack, onDisconnect, onSheetChanged) {
  const config = await getConfig();
  container.innerHTML = `<div class="settings-panel">
    <button class="btn-back" id="btn-settings-back">← Back</button>
    <h2 class="settings-title">Settings</h2>
    ${config.connectedEmail ? `<p class="settings-email">Signed in as <strong>${esc(config.connectedEmail)}</strong></p>` : ''}
    <div class="settings-current">
      <span class="settings-label">Current sheet</span>
      <span class="settings-value">${esc(config.spreadsheetTitle || 'Job Applications')} › ${esc(config.sheetName || '—')}</span>
    </div>
    <div class="settings-actions">
      <button class="btn-settings-action" id="btn-use-different">📂 Use a different sheet</button>
      <button class="btn-settings-action" id="btn-create-new-sheet">✦ Create a new sheet</button>
    </div>
    <hr class="settings-divider"/>
    <button class="btn-settings-danger" id="btn-disconnect">Disconnect Google Account</button>
  </div>`;

  container.querySelector('#btn-settings-back').addEventListener('click', onBack);

  container.querySelector('#btn-use-different').addEventListener('click', () => {
    renderStep3B(container, () => onSheetChanged(), true);
  });

  container.querySelector('#btn-create-new-sheet').addEventListener('click', async () => {
    const btn = container.querySelector('#btn-create-new-sheet');
    btn.disabled = true; btn.textContent = 'Creating…';
    const DEFAULT = ['Company','Location','Role','Date','Referral/Online/LinkedIn','Mentioned Base Pay','Requested Base Pay','Job ID','Notes'];
    try {
      const { spreadsheetId, sheetName } = await createSheet(DEFAULT);
      await setConfig({ isConfigured: true, spreadsheetId, sheetName, columnHeaders: [...DEFAULT, 'Added by'], spreadsheetTitle: 'Job Applications' });
      onSheetChanged();
    } catch (err) {
      const el = document.createElement('div'); el.className = 'inline-error'; el.textContent = err.message;
      container.querySelector('.settings-panel').appendChild(el);
      btn.disabled = false; btn.textContent = '✦ Create a new sheet';
    }
  });

  container.querySelector('#btn-disconnect').addEventListener('click', async () => {
    if (!confirm('Disconnect your Google Account and clear all settings?')) return;
    const btn = container.querySelector('#btn-disconnect');
    btn.disabled = true; btn.textContent = 'Disconnecting…';
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'REVOKE_TOKEN' }, (r) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve();
        });
      });
      await clearConfig();
      onDisconnect();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Disconnect Google Account';
      const el = document.createElement('div'); el.className = 'inline-error'; el.textContent = err.message;
      btn.after(el);
    }
  });
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
