// claude.js — Claude API extraction + semantic column mapping

import { ANTHROPIC_API_KEY } from './config.js';

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

export function formatTodayDate() {
  const now = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const day = now.getDate();
  return `${months[now.getMonth()]} ${day}${ordinal(day)}`;
}

function ordinal(n) {
  const s = n % 100;
  if (s >= 11 && s <= 13) return 'th';
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}

export function detectSource(url) {
  return url.includes('linkedin.com') ? 'LinkedIn' : 'Online';
}

export function buildHyperlinkFormula(url) {
  let label = 'Job Posting';
  try { const u = new URL(url); label = u.hostname.replace(/^www\./, ''); } catch (_) {}
  const safeUrl = url.replace(/"/g, '""');
  const safeLabel = label.replace(/"/g, '""');
  return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
}

const SYSTEM_PROMPT = `You are a job application data extractor. Given the text of a job posting webpage, extract the following fields and return ONLY a valid JSON object — no markdown, no explanation.

Fields:
- company: string
- location: string (comma-separated if multiple; include remote/hybrid/onsite)
- role: string (exact job title)
- source: string ("LinkedIn" if URL contains linkedin.com, otherwise "Online")
- basePay: string (exact text from posting, or "Not mentioned")
- notes: string (team or org name only if explicitly stated, else "")

Rules:
- Never hallucinate or infer values not present in the text.
- For basePay, copy the exact figure/range from the page.
- For notes, only include a team name if the posting explicitly names it.
- requestedBasePay and addedBy are never extracted — omit from JSON entirely.`;

export async function extractJobData(pageText, pageUrl) {
  const userMessage = `URL: ${pageUrl}\n\n---PAGE TEXT---\n${pageText.slice(0, 15000)}`;
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Claude API error ${response.status}`);
  }
  const data = await response.json();
  const rawText = data.content?.[0]?.text || '{}';
  let extracted;
  try {
    const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    extracted = JSON.parse(cleaned);
  } catch (_) { throw new Error('Claude returned invalid JSON. Please try again.'); }
  return {
    company: extracted.company || '',
    location: extracted.location || '',
    role: extracted.role || '',
    source: detectSource(pageUrl),
    basePay: extracted.basePay || 'Not mentioned',
    notes: extracted.notes || '',
    date: formatTodayDate(),
    jobIdFormula: buildHyperlinkFormula(pageUrl),
    requestedBasePay: '',
  };
}

const FIELD_ALIASES = {
  company:          ['company','employer','organization','org','firm'],
  location:         ['location','locations','city','office','place','where'],
  role:             ['role','position','title','job title','job','opening'],
  date:             ['date','applied','applied on','application date','day'],
  source:           ['source','referral/online/linkedin','referral','how','channel','via'],
  basePay:          ['mentioned base pay','base pay','pay','salary','compensation','comp','wage'],
  requestedBasePay: ['requested base pay','desired pay','expected salary','ask','expected pay','desired salary','target pay'],
  jobIdFormula:     ['job id','job link','posting','link','url','posting link'],
  notes:            ['notes','note','team','comments','additional info','info'],
  addedBy:          ['added by','tracked by','added','by'],
};

export function mapColumnsToFields(headers) {
  const mapping = {};
  const unmapped = [];
  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().trim();
    let matched = false;
    for (const [fieldKey, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(normalized)) {
        if (!(fieldKey in mapping)) mapping[fieldKey] = index;
        matched = true;
        break;
      }
    }
    if (!matched && header.trim() !== '') unmapped.push({ header: header.trim(), index });
  });
  return { mapping, unmapped };
}

export function buildRowValues(jobData, headers, mapping, extras = {}) {
  const row = new Array(headers.length).fill('');
  const fieldValues = {
    company: jobData.company, location: jobData.location, role: jobData.role,
    date: jobData.date, source: jobData.source, basePay: jobData.basePay,
    requestedBasePay: jobData.requestedBasePay || '', jobIdFormula: jobData.jobIdFormula,
    notes: jobData.notes, addedBy: 'Claude',
  };
  for (const [fieldKey, colIndex] of Object.entries(mapping)) {
    if (colIndex < row.length && fieldKey in fieldValues) row[colIndex] = fieldValues[fieldKey];
  }
  headers.forEach((header, index) => {
    if (extras[header] !== undefined) row[index] = extras[header];
  });
  return row;
}
