// popup.js — State machine: ONBOARDING→IDLE→LOADING→REVIEW→DUPLICATE→SUCCESS→ERROR

import { getConfig, setConfig } from './storage.js';
import { initOnboarding } from './onboarding.js';
import { renderSettings } from './settings.js';
import { readHeaders, readAllRows, appendRow } from './sheets.js';
import { extractJobData, mapColumnsToFields, buildRowValues, analyzeResumeMatch } from './claude.js';

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('app');
  const config = await getConfig();
  if (!config.isConfigured) renderOnboarding(root);
  else renderIdle(root);
});

function renderOnboarding(root) {
  root.innerHTML = '<div id="ob"></div>';
  initOnboarding(root.querySelector('#ob'), () => renderIdle(root));
}

async function renderIdle(root) {
  const config = await getConfig();
  root.innerHTML = `<div class="state-idle">
    <div class="idle-logo"><span class="logo-mark">◆</span><span class="logo-text">Job Tracker</span></div>
    <p class="idle-tagline">Tracked by Claude. Saved to Sheets.</p>
    <div class="idle-actions">
      <button class="btn-track" id="btn-track">Track This Application</button>
      <button class="btn-resume-fit" id="btn-resume-fit">Resume Compatibility</button>
    </div>
    ${footer(config)}
  </div>`;
  root.querySelector('#btn-track').addEventListener('click', () => startExtraction(root));
  root.querySelector('#btn-resume-fit').addEventListener('click', () => renderResumeMatch(root));
  wireFooter(root);
}

async function startExtraction(root) {
  const steps = ['Reading page…','Extracting with Claude…','Checking for duplicates…','Ready for review'];
  let si = 0;
  root.innerHTML = `<div class="state-loading"><div class="loading-spinner"></div><p class="loading-status" id="ls">${steps[0]}</p></div>`;
  const setStatus = (m) => { const el = root.querySelector('#ls'); if (el) el.textContent = m; };
  const interval = setInterval(() => { si = Math.min(si+1, steps.length-2); setStatus(steps[si]); }, 1800);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Could not access the current tab.');
    let pageText = '';
    try {
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.body.innerText });
      pageText = results?.[0]?.result || '';
    } catch (e) { throw new Error('Cannot read this page. Try a regular job posting page.'); }
    if (!pageText.trim()) throw new Error('Page appears to be empty or unreadable.');
    setStatus(steps[1]);
    const jobData = await extractJobData(pageText, tab.url);
    setStatus(steps[2]);
    const config = await getConfig();
    const headers = config.columnHeaders?.length ? config.columnHeaders : await readHeaders(config.spreadsheetId, config.sheetName);
    const { mapping, unmapped } = mapColumnsToFields(headers);
    const allRows = await readAllRows(config.spreadsheetId, config.sheetName);
    const dup = findDuplicate(allRows, mapping, jobData);
    clearInterval(interval);
    setStatus(steps[3]);
    await sleep(400);
    if (dup) renderDuplicate(root, dup, jobData, headers, mapping, config);
    else renderReview(root, jobData, headers, mapping, unmapped, config);
  } catch (err) { clearInterval(interval); renderError(root, err.message || 'Something went wrong.'); }
}

function renderReview(root, jobData, headers, mapping, unmapped, config) {
  const FIELDS = [
    { key:'role', label:'Role' },{ key:'company', label:'Company' },{ key:'location', label:'Location' },
    { key:'date', label:'Date' },{ key:'source', label:'Source' },{ key:'basePay', label:'Mentioned Base Pay' },
    { key:'requestedBasePay', label:'Requested Base Pay' },{ key:'jobIdFormula', label:'Job ID' },{ key:'notes', label:'Notes' },
  ];
  const buildRow = ({ key, label }) => {
    const val = jobData[key] ?? '';
    if (key === 'source') return `<div class="review-row"><span class="review-label">${label}</span><select class="review-select" data-field="${key}">${['Online','LinkedIn','Referral'].map((o)=>`<option ${o===val?'selected':''}>${o}</option>`).join('')}</select></div>`;
    if (key === 'requestedBasePay') return `<div class="review-row"><span class="review-label">${label}</span><input class="review-input" type="text" data-field="${key}" value="" placeholder="e.g. $130,000" autocomplete="off"/></div>`;
    return `<div class="review-row"><span class="review-label">${label}</span><input class="review-input" type="text" data-field="${key}" value="${esc(val)}" autocomplete="off"/></div>`;
  };
  const extraRows = unmapped.map(({ header }) => `<div class="review-row"><span class="review-label review-label-custom">${esc(header)}</span><input class="review-input" type="text" data-extra="${esc(header)}" value="" placeholder="Optional" autocomplete="off"/></div>`).join('');
  root.innerHTML = `<div class="state-review">
    <div class="review-header"><span class="review-title">Review &amp; Save</span></div>
    <div class="review-card">${FIELDS.map(buildRow).join('')}${extraRows}</div>
    <div class="review-actions">
      <button class="btn-accept" id="btn-accept">✓ Accept &amp; Save</button>
      <button class="btn-decline" id="btn-decline">✗ Decline</button>
    </div>
    ${footer(config)}
  </div>`;
  root.querySelector('#btn-accept').addEventListener('click', async () => {
    const btn = root.querySelector('#btn-accept');
    btn.disabled = true; btn.textContent = 'Saving…';
    root.querySelectorAll('[data-field]').forEach((el) => { jobData[el.dataset.field] = el.value; });
    const extras = {};
    root.querySelectorAll('[data-extra]').forEach((el) => { extras[el.dataset.extra] = el.value; });
    try {
      const row = buildRowValues(jobData, headers, mapping, extras);
      await appendRow(config.spreadsheetId, config.sheetName, row);
      renderSuccess(root, jobData);
    } catch (err) { renderError(root, err.message || 'Failed to save.'); }
  });
  root.querySelector('#btn-decline').addEventListener('click', () => renderIdle(root));
  wireFooter(root);
}

function renderDuplicate(root, dup, jobData, headers, mapping, config) {
  root.innerHTML = `<div class="state-duplicate">
    <div class="duplicate-icon">⚠️</div>
    <h2>Possible Duplicate</h2>
    <p class="duplicate-sub">You may have already applied here:</p>
    <div class="duplicate-card">
      <div class="dup-row"><span class="dup-label">Role</span><span class="dup-val">${esc(dup.role)}</span></div>
      <div class="dup-row"><span class="dup-label">Company</span><span class="dup-val">${esc(dup.company)}</span></div>
      <div class="dup-row"><span class="dup-label">Date</span><span class="dup-val">${esc(dup.date)}</span></div>
    </div>
    <div class="review-actions">
      <button class="btn-accept" id="btn-save-anyway">Save Anyway</button>
      <button class="btn-decline" id="btn-cancel">Cancel</button>
    </div>
  </div>`;
  root.querySelector('#btn-save-anyway').addEventListener('click', async () => {
    const btn = root.querySelector('#btn-save-anyway');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const row = buildRowValues(jobData, headers, mapping);
      await appendRow(config.spreadsheetId, config.sheetName, row);
      renderSuccess(root, jobData);
    } catch (err) { renderError(root, err.message || 'Failed to save.'); }
  });
  root.querySelector('#btn-cancel').addEventListener('click', () => renderIdle(root));
}

function renderSuccess(root, jobData) {
  root.innerHTML = `<div class="state-success">
    <div class="success-icon">✓</div>
    <p class="success-message">Saved — ${esc(jobData.role)} at ${esc(jobData.company)}</p>
    <p class="success-sub">Closing in a moment…</p>
  </div>`;
  setTimeout(() => window.close(), 2500);
}

function renderError(root, message) {
  root.innerHTML = `<div class="state-error">
    <div class="error-icon">✕</div>
    <p class="error-message">${esc(message)}</p>
    <button class="btn-primary" id="btn-retry">Retry</button>
  </div>`;
  root.querySelector('#btn-retry').addEventListener('click', () => renderIdle(root));
}

async function renderResumeMatch(root) {
  root.innerHTML = `<div class="state-resume-match">
    <div class="match-top">
      <button class="btn-back" id="btn-back">← Back</button>
      <span class="match-title">Resume Compatibility</span>
      <p class="match-desc">Score your resume against this job posting.</p>
    </div>
    <div class="match-body">
      <label class="file-drop" id="file-drop-zone" for="resume-file">
        <input type="file" id="resume-file" accept=".pdf" style="display:none"/>
        <span class="file-drop-icon">📄</span>
        <span class="file-drop-text">Click to upload resume</span>
        <span class="file-drop-hint">PDF format · max 10 MB</span>
      </label>
      <div class="file-selected" id="file-selected" style="display:none">
        <span class="file-selected-icon">✓</span>
        <span class="file-name" id="file-name"></span>
        <button class="btn-clear-file" id="btn-clear-file" type="button">✕</button>
      </div>
      <button class="btn-primary" id="btn-analyze" disabled>Analyze</button>
    </div>
  </div>`;

  let cachedBase64 = null;
  const fileInput = root.querySelector('#resume-file');
  const fileDropEl = root.querySelector('#file-drop-zone');
  const fileSelected = root.querySelector('#file-selected');
  const fileNameEl = root.querySelector('#file-name');
  const btnAnalyze = root.querySelector('#btn-analyze');

  const showCached = (fileName, base64) => {
    cachedBase64 = base64;
    fileNameEl.textContent = fileName;
    fileDropEl.style.display = 'none';
    fileSelected.style.display = 'flex';
    btnAnalyze.disabled = false;
  };

  const clearCache = () => {
    cachedBase64 = null;
    fileInput.value = '';
    fileSelected.style.display = 'none';
    fileDropEl.style.display = 'flex';
    btnAnalyze.disabled = true;
    chrome.storage.session.remove('resumeCache');
  };

  // Restore cached resume if available
  const { resumeCache } = await chrome.storage.session.get('resumeCache');
  if (resumeCache) showCached(resumeCache.fileName, resumeCache.pdfBase64);

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await readFileAsBase64(file);
    await chrome.storage.session.set({ resumeCache: { pdfBase64: base64, fileName: file.name } });
    showCached(file.name, base64);
  });

  root.querySelector('#btn-clear-file').addEventListener('click', clearCache);
  btnAnalyze.addEventListener('click', () => { if (cachedBase64) startResumeMatch(root, cachedBase64); });
  root.querySelector('#btn-back').addEventListener('click', () => renderIdle(root));
}

async function startResumeMatch(root, pdfBase64) {
  root.innerHTML = `<div class="state-loading"><div class="loading-spinner"></div><p class="loading-status" id="ls">Reading page…</p></div>`;
  const setStatus = (m) => { const el = root.querySelector('#ls'); if (el) el.textContent = m; };

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Could not access the current tab.');
    let pageText = '';
    try {
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.body.innerText });
      pageText = results?.[0]?.result || '';
    } catch (_) { throw new Error('Cannot read this page. Open a job posting and try again.'); }
    if (!pageText.trim()) throw new Error('Page appears empty. Open a job posting first.');
    setStatus('Analyzing compatibility…');
    const result = await analyzeResumeMatch(pageText, pdfBase64);
    renderMatchResult(root, result);
  } catch (err) {
    root.innerHTML = `<div class="state-error">
      <div class="error-icon">✕</div>
      <p class="error-message">${esc(err.message || 'Something went wrong.')}</p>
      <button class="btn-primary" id="btn-retry">Try Again</button>
    </div>`;
    root.querySelector('#btn-retry').addEventListener('click', () => renderResumeMatch(root));
  }
}

function renderMatchResult(root, result) {
  const score = Math.max(0, Math.min(100, Math.round(result.score || 0)));
  const ringClass = score >= 75 ? 'score-ring-green' : score >= 50 ? 'score-ring-yellow' : 'score-ring-red';
  const fitLabel = score >= 75 ? 'Strong fit' : score >= 50 ? 'Moderate fit' : 'Weak fit';
  const strengths = Array.isArray(result.strengths) ? result.strengths.slice(0, 3) : [];
  const gaps = Array.isArray(result.gaps) ? result.gaps.slice(0, 3) : [];
  const listItems = (items) => items.map((s) => `<li>${esc(String(s))}</li>`).join('');

  root.innerHTML = `<div class="state-match-result">
    <div class="match-result-header">
      <button class="btn-back" id="btn-back">← Back</button>
    </div>
    <div class="match-result-body">
      <div class="score-ring ${ringClass}">
        <span class="score-num">${score}<span class="score-pct">%</span></span>
        <span class="score-label">${fitLabel}</span>
      </div>
      <p class="match-summary">${esc(result.summary || '')}</p>
      ${strengths.length ? `<div class="match-section">
        <div class="match-section-label">Strengths</div>
        <ul class="match-list match-list-green">${listItems(strengths)}</ul>
      </div>` : ''}
      ${gaps.length ? `<div class="match-section">
        <div class="match-section-label">Gaps</div>
        <ul class="match-list match-list-red">${listItems(gaps)}</ul>
      </div>` : ''}
    </div>
    <div class="match-result-footer">
      <button class="btn-primary" id="btn-new-resume">Try Another Resume</button>
    </div>
  </div>`;

  root.querySelector('#btn-back').addEventListener('click', () => renderIdle(root));
  root.querySelector('#btn-new-resume').addEventListener('click', () => renderResumeMatch(root));
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function findDuplicate(rows, mapping, jobData) {
  const ci = mapping['company'] ?? -1, ri = mapping['role'] ?? -1, di = mapping['date'] ?? -1;
  if (ci < 0 || ri < 0) return null;
  const tc = jobData.company.toLowerCase().trim(), tr = jobData.role.toLowerCase().trim();
  for (const row of rows) {
    if ((row[ci]||'').toLowerCase().trim() === tc && (row[ri]||'').toLowerCase().trim() === tr)
      return { company: row[ci]||'', role: row[ri]||'', date: di>=0 ? row[di]||'' : '' };
  }
  return null;
}

function footer(config) {
  return `<div class="footer">
    <span class="footer-sheet"><span class="footer-icon">📊</span>${esc(config.sheetName||'No sheet')}</span>
    <span class="footer-actions">
      <button class="btn-footer-link" id="btn-refresh-cols">↺ Refresh</button>
      <button class="btn-footer-link" id="btn-switch-sheet">⚙ Switch</button>
    </span>
  </div>`;
}

function wireFooter(root) {
  root.querySelector('#btn-refresh-cols')?.addEventListener('click', async () => {
    const btn = root.querySelector('#btn-refresh-cols');
    btn.textContent = '↺ …'; btn.disabled = true;
    try {
      const cfg = await getConfig();
      const { readHeaders } = await import('./sheets.js');
      const h = await readHeaders(cfg.spreadsheetId, cfg.sheetName);
      await setConfig({ columnHeaders: h });
      btn.textContent = '↺ Done!';
      setTimeout(() => { btn.textContent = '↺ Refresh'; btn.disabled = false; }, 1500);
    } catch { btn.textContent = '↺ Error'; setTimeout(() => { btn.textContent = '↺ Refresh'; btn.disabled = false; }, 2000); }
  });
  root.querySelector('#btn-switch-sheet')?.addEventListener('click', async () => {
    const r = document.getElementById('app');
    renderSettings(r, () => renderIdle(r), () => renderOnboarding(r), () => renderIdle(r));
  });
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
