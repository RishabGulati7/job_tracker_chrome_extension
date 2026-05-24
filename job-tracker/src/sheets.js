// sheets.js — Google Sheets API helpers

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export async function getToken() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (response?.error) return reject(new Error(response.error));
      resolve(response.token);
    });
  });
}

async function sheetsRequest(url, options = {}, retried = false) {
  const token = await getToken();
  const res = await fetch(url, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 401 && !retried) {
    await new Promise((r) => chrome.runtime.sendMessage({ type: 'CLEAR_TOKEN' }, r));
    return sheetsRequest(url, options, true);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Sheets API error ${res.status}`);
  }
  return res.json();
}

export async function getSpreadsheetMeta(spreadsheetId) {
  const data = await sheetsRequest(`${BASE}/${spreadsheetId}?fields=properties.title,sheets.properties`);
  return {
    title: data.properties.title,
    sheets: data.sheets.map((s) => ({ title: s.properties.title, sheetId: s.properties.sheetId })),
  };
}

export async function readHeaders(spreadsheetId, sheetName) {
  const range = encodeURIComponent(`'${sheetName}'!1:1`);
  const data = await sheetsRequest(`${BASE}/${spreadsheetId}/values/${range}`);
  return (data.values?.[0] || []).map((h) => String(h).trim());
}

export async function readAllRows(spreadsheetId, sheetName) {
  const range = encodeURIComponent(`'${sheetName}'!A2:Z`);
  const data = await sheetsRequest(`${BASE}/${spreadsheetId}/values/${range}`);
  return data.values || [];
}

export async function appendRow(spreadsheetId, sheetName, rowValues) {
  const range = encodeURIComponent(`'${sheetName}'!A1`);
  await sheetsRequest(
    `${BASE}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [rowValues] }) }
  );
}

export async function createSheet(userHeaders) {
  const allHeaders = [...userHeaders, 'Added by'];
  const token = await getToken();
  const createRes = await fetch(BASE, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: 'Job Applications' },
      sheets: [{ properties: { title: 'Applications' } }],
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to create spreadsheet');
  }
  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId;
  const sheetName = created.sheets[0].properties.title;
  const range = encodeURIComponent(`'${sheetName}'!A1`);
  await sheetsRequest(
    `${BASE}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ values: [allHeaders] }) }
  );
  await sheetsRequest(`${BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ repeatCell: {
        range: { sheetId: created.sheets[0].properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      }}],
    }),
  });
  return { spreadsheetId, sheetName };
}

export function parseSpreadsheetId(input) {
  input = input.trim();
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(input)) return input;
  return null;
}

export async function getUserEmail() {
  const token = await getToken();
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.email || '';
}
