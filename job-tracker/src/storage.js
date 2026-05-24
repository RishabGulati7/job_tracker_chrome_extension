// storage.js — chrome.storage.local helpers
const STORAGE_KEY = 'jobTrackerConfig';

export async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve(result[STORAGE_KEY] || {
        isConfigured: false,
        spreadsheetId: '',
        sheetName: '',
        columnHeaders: [],
        connectedEmail: '',
      });
    });
  });
}

export async function setConfig(updates) {
  const current = await getConfig();
  const next = { ...current, ...updates };
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(next);
    });
  });
}

export async function clearConfig() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(STORAGE_KEY, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}
