// background.js — MV3 Service Worker: OAuth2 token management

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_TOKEN') {
    getAuthToken()
      .then((token) => sendResponse({ token }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'CLEAR_TOKEN') {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) chrome.identity.removeCachedAuthToken({ token }, () => sendResponse({ ok: true }));
      else sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === 'REVOKE_TOKEN') {
    revokeToken()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!token) return reject(new Error('Could not obtain auth token.'));
      resolve(token);
    });
  });
}

async function revokeToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (!token) return resolve();
      fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {});
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
  });
}
