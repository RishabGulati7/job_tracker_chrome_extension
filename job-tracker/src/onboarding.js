// onboarding.js — First-run onboarding: Step 1 → 2 → 3A/3B

import { setConfig } from './storage.js';
import { getSpreadsheetMeta, readHeaders, createSheet, parseSpreadsheetId, getUserEmail } from './sheets.js';

const DEFAULT_USER_HEADERS = ['Company','Location','Role','Date','Referral/Online/LinkedIn','Mentioned Base Pay','Requested Base Pay','Job ID','Notes'];

export function initOnboarding(container, onComplete) {
  renderStep1(container, onComplete);
}

function renderStep1(container, onComplete) {
  container.innerHTML = `<div class="onboarding">
    <div class="step-indicator">Step 1 of 3</div>
    <div class="step-progress"><div class="step-bar" style="width:33%"></div></div>
    <div class="onboarding-icon">🔗</div>
    <h2>Connect Google Account</h2>
    <p class="onboarding-desc">Job Tracker needs read &amp; write access to Google Sheets to save your applications. We only access sheets you explicitly choose.</p>
    <button class="btn-primary" id="btn-connect-google">Connect with Google</button>
    <p class="onboarding-note">You'll see a Google permissions prompt.</p>
    <div id="step1-error" class="inline-error" style="display:none"></div>
  </div>`;
  container.querySelector('#btn-connect-google').addEventListener('click', async () => {
    const btn = container.querySelector('#btn-connect-google');
    btn.disabled = true; btn.textContent = 'Connecting…';
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (r?.error) return reject(new Error(r.error));
          resolve(r.token);
        });
      });
      const email = await getUserEmail().catch(() => '');
      await setConfig({ connectedEmail: email });
      renderStep2(container, onComplete);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Connect with Google';
      showErr(container, err.message, 'step1-error');
    }
  });
}

function renderStep2(container, onComplete) {
  container.innerHTML = `<div class="onboarding">
    <div class="step-indicator">Step 2 of 3</div>
    <div class="step-progress"><div class="step-bar" style="width:66%"></div></div>
    <div class="onboarding-icon">📊</div>
    <h2>Choose Your Sheet</h2>
    <p class="onboarding-desc">Where should Job Tracker save your applications?</p>
    <div class="sheet-choice-grid">
      <button class="card-choice" id="btn-create-new"><span class="card-icon">✦</span><span class="card-label">Create new sheet</span><span class="card-sub">We'll set it up for you</span></button>
      <button class="card-choice" id="btn-use-existing"><span class="card-icon">📂</span><span class="card-label">Use existing sheet</span><span class="card-sub">Paste a Sheet URL or ID</span></button>
    </div>
  </div>`;
  container.querySelector('#btn-create-new').addEventListener('click', () => renderStep3A(container, onComplete));
  container.querySelector('#btn-use-existing').addEventListener('click', () => renderStep3B(container, onComplete));
}

function renderStep3A(container, onComplete) {
  let columns = DEFAULT_USER_HEADERS.map((h) => ({ label: h, checked: true }));
  let customColumns = [];
  function render() {
    container.innerHTML = `<div class="onboarding">
      <div class="step-indicator">Step 3 of 3</div>
      <div class="step-progress"><div class="step-bar" style="width:100%"></div></div>
      <div class="onboarding-icon">✦</div>
      <h2>Customize Columns</h2>
      <p class="onboarding-desc">Choose which columns to include. "Added by" is always added silently.</p>
      <div class="column-checklist" id="col-checklist">
        ${columns.map((col, i) => `<label class="col-check-row"><input type="checkbox" data-index="${i}" ${col.checked ? 'checked' : ''}/><span>${col.label}</span></label>`).join('')}
        ${customColumns.map((col, i) => `<div class="col-check-row custom-col-row"><input type="checkbox" checked disabled/><span class="custom-col-label">${col}</span><button class="btn-remove-col" data-ci="${i}">✕</button></div>`).join('')}
      </div>
      <div class="add-col-row">
        <input type="text" id="new-col-input" placeholder="Custom column name" maxlength="60"/>
        <button class="btn-add-col" id="btn-add-col">+ Add</button>
      </div>
      <div id="step3a-error" class="inline-error" style="display:none"></div>
      <button class="btn-primary" id="btn-create-sheet">Create Sheet &amp; Continue</button>
      <button class="btn-ghost" id="btn-back">← Back</button>
    </div>`;
    container.querySelectorAll('#col-checklist input[type=checkbox]:not([disabled])').forEach((cb) => {
      cb.addEventListener('change', (e) => { columns[+e.target.dataset.index].checked = e.target.checked; });
    });
    container.querySelectorAll('.btn-remove-col').forEach((btn) => {
      btn.addEventListener('click', (e) => { customColumns.splice(+e.target.dataset.ci, 1); render(); });
    });
    container.querySelector('#btn-add-col').addEventListener('click', () => {
      const input = container.querySelector('#new-col-input');
      const val = input.value.trim();
      if (!val) return;
      customColumns.push(val); input.value = ''; render();
    });
    container.querySelector('#new-col-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') container.querySelector('#btn-add-col').click(); });
    container.querySelector('#btn-create-sheet').addEventListener('click', async () => {
      const btn = container.querySelector('#btn-create-sheet');
      btn.disabled = true; btn.textContent = 'Creating…';
      const selected = columns.filter((c) => c.checked).map((c) => c.label);
      const allH = [...selected, ...customColumns];
      if (!allH.length) { showErr(container, 'Select at least one column.', 'step3a-error'); btn.disabled = false; btn.textContent = 'Create Sheet & Continue'; return; }
      try {
        const { spreadsheetId, sheetName } = await createSheet(allH);
        await setConfig({ isConfigured: true, spreadsheetId, sheetName, columnHeaders: [...allH, 'Added by'] });
        onComplete();
      } catch (err) { showErr(container, err.message, 'step3a-error'); btn.disabled = false; btn.textContent = 'Create Sheet & Continue'; }
    });
    container.querySelector('#btn-back').addEventListener('click', () => renderStep2(container, onComplete));
  }
  render();
}

export async function renderStep3B(container, onComplete, skipBack = false) {
  container.innerHTML = `<div class="onboarding">
    <div class="step-indicator">Step 3 of 3</div>
    <div class="step-progress"><div class="step-bar" style="width:100%"></div></div>
    <div class="onboarding-icon">📂</div>
    <h2>Connect Existing Sheet</h2>
    <p class="onboarding-desc">Paste your Google Sheet URL or ID below.</p>
    <input type="text" id="sheet-url-input" class="sheet-url-input" placeholder="https://docs.google.com/spreadsheets/d/..." autocomplete="off" spellcheck="false"/>
    <div id="step3b-error" class="inline-error" style="display:none"></div>
    <button class="btn-primary" id="btn-connect-sheet">Connect Sheet</button>
    ${!skipBack ? '<button class="btn-ghost" id="btn-back">← Back</button>' : ''}
  </div>`;
  if (!skipBack) container.querySelector('#btn-back')?.addEventListener('click', () => renderStep2(container, onComplete));
  container.querySelector('#btn-connect-sheet').addEventListener('click', async () => {
    const btn = container.querySelector('#btn-connect-sheet');
    const raw = container.querySelector('#sheet-url-input').value.trim();
    if (!raw) { showErr(container, 'Please enter a Sheet URL or ID.', 'step3b-error'); return; }
    const spreadsheetId = parseSpreadsheetId(raw);
    if (!spreadsheetId) { showErr(container, 'Could not parse a Sheet ID from that URL.', 'step3b-error'); return; }
    btn.disabled = true; btn.textContent = 'Connecting…';
    try {
      const meta = await getSpreadsheetMeta(spreadsheetId);
      if (meta.sheets.length === 1) await finishConnect(container, spreadsheetId, meta, meta.sheets[0].title, onComplete);
      else renderTabPicker(container, spreadsheetId, meta, onComplete, false);
    } catch (err) { showErr(container, err.message || 'Could not access that sheet.', 'step3b-error'); btn.disabled = false; btn.textContent = 'Connect Sheet'; }
  });
}

export function renderTabPicker(container, spreadsheetId, meta, onComplete, skipBack = false) {
  const sheets = meta.sheets;
  container.innerHTML = `<div class="onboarding">
    <div class="onboarding-icon">📑</div>
    <h2>Which tab should we track to?</h2>
    <p class="onboarding-desc">Found in: <strong>${esc(meta.title)}</strong></p>
    <div class="tab-picker" id="tab-picker">
      ${sheets.map((s, i) => `<label class="tab-option ${i===0?'selected':''}"><input type="radio" name="tab" value="${esc(s.title)}" ${i===0?'checked':''}/><span>${esc(s.title)}</span></label>`).join('')}
    </div>
    <div id="tabpicker-error" class="inline-error" style="display:none"></div>
    <button class="btn-primary" id="btn-confirm-tab">Confirm Tab</button>
    ${!skipBack ? '<button class="btn-ghost" id="btn-back">← Back</button>' : ''}
  </div>`;
  let selected = sheets[0].title;
  container.querySelectorAll('input[name=tab]').forEach((r) => {
    r.addEventListener('change', (e) => {
      selected = e.target.value;
      container.querySelectorAll('.tab-option').forEach((o) => o.classList.remove('selected'));
      e.target.closest('.tab-option').classList.add('selected');
    });
  });
  container.querySelector('#btn-confirm-tab').addEventListener('click', async () => {
    const btn = container.querySelector('#btn-confirm-tab');
    btn.disabled = true; btn.textContent = 'Loading…';
    try { await finishConnect(container, spreadsheetId, meta, selected, onComplete); }
    catch (err) { showErr(container, err.message, 'tabpicker-error'); btn.disabled = false; btn.textContent = 'Confirm Tab'; }
  });
  if (!skipBack) container.querySelector('#btn-back')?.addEventListener('click', () => renderStep3B(container, onComplete));
}

async function finishConnect(container, spreadsheetId, meta, sheetName, onComplete) {
  const headers = await readHeaders(spreadsheetId, sheetName);
  const displayH = headers.filter(Boolean).join(', ') || '(none found)';
  container.innerHTML = `<div class="onboarding">
    <div class="onboarding-icon">✅</div>
    <h2>Sheet Connected</h2>
    <div class="confirm-card">
      <div class="confirm-row"><span class="confirm-label">Spreadsheet</span><span class="confirm-value">${esc(meta.title)}</span></div>
      <div class="confirm-row"><span class="confirm-label">Active tab</span><span class="confirm-value">${esc(sheetName)}</span></div>
      <div class="confirm-row"><span class="confirm-label">Columns found</span><span class="confirm-value">${esc(displayH)}</span></div>
    </div>
    <div id="confirm-error" class="inline-error" style="display:none"></div>
    <button class="btn-primary" id="btn-confirm-connect">Confirm &amp; Start Tracking</button>
  </div>`;
  container.querySelector('#btn-confirm-connect').addEventListener('click', async () => {
    const btn = container.querySelector('#btn-confirm-connect');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await setConfig({ isConfigured: true, spreadsheetId, sheetName, columnHeaders: headers, spreadsheetTitle: meta.title });
      onComplete();
    } catch (err) { showErr(container, err.message, 'confirm-error'); btn.disabled = false; btn.textContent = 'Confirm & Start Tracking'; }
  });
}

function showErr(container, message, id) {
  let el = container.querySelector(`#${id}`);
  if (!el) { el = document.createElement('div'); el.className = 'inline-error'; el.id = id; container.querySelector('.onboarding')?.appendChild(el); }
  el.textContent = message; el.style.display = 'block';
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
