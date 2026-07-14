import { normalizeXClientId } from '../core/constants.js';

const X_AUTH_URL = 'https://x.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const X_API_BASES = ['https://api.x.com/2', 'https://api.twitter.com/2'];
const X_SCOPES = ['tweet.read', 'users.read', 'offline.access'].join(' ');
const X_PRODUCTION_REDIRECT_URI = 'https://pnebfccjecdlpcjaonmppfidlipkojoj.chromiumapp.org/x-oauth';

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length = 64) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, value => alphabet[value % alphabet.length]).join('');
}

async function sha256(text) {
  const encoded = new TextEncoder().encode(text);
  return crypto.subtle.digest('SHA-256', encoded);
}

async function buildPkceChallenge(verifier) {
  return base64UrlEncode(await sha256(verifier));
}

function getRedirectUrl() {
  return chrome.identity.getRedirectURL('x-oauth');
}

function buildAuthorizeUrl(params = {}) {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${X_AUTH_URL}?${query}`;
}

async function getXOAuthRequestPreview(clientId = '') {
  const redirectUri = getRedirectUrl();
  return {
    clientId: normalizeXClientId(clientId),
    redirectUri,
    scope: X_SCOPES,
    flow: 'popup',
    codeChallengeMethod: 'S256',
    fallbackRedirectUri: redirectUri === X_PRODUCTION_REDIRECT_URI ? '' : X_PRODUCTION_REDIRECT_URI
  };
}

function getRedirectCandidates() {
  const currentRedirectUri = getRedirectUrl();
  return [currentRedirectUri, X_PRODUCTION_REDIRECT_URI]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function withOAuthSetupHint(message, { clientId = '', redirectUri = '' } = {}) {
  const details = [
    message,
    'X did not redirect back to the extension.',
    'Check that OAuth 2.0 is enabled in the X Developer App, the app type is Native App or Single page App, and the Callback URI exactly matches the current extension redirect URL.'
  ];
  if (redirectUri) details.push(`Callback URI: ${redirectUri}`);
  if (clientId) details.push(`Client ID: ${clientId}`);
  return details.join(' ');
}

function withOAuthHint(message, data = {}) {
  const raw = [
    message,
    data.error_description,
    data.detail,
    data.error,
    data.title
  ].filter(Boolean).join(': ');
  const lower = raw.toLowerCase();
  if (lower.includes('invalid_client') || lower.includes('unauthorized_client') || lower.includes('client')) {
    return `${raw}. Check X Developer Portal: the OAuth 2.0 app type should be Native App or Single page App for a Chrome extension. Web App / Automated App requires a client secret and will fail in an extension.`;
  }
  if (lower.includes('redirect') || lower.includes('callback')) {
    return `${raw}. Check that the Callback URI exactly matches ${getRedirectUrl()}`;
  }
  return raw;
}

function createPopupWindow(createData) {
  return new Promise((resolve, reject) => {
    chrome.windows.create(createData, (windowInfo) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(windowInfo);
    });
  });
}

function removeWindow(windowId) {
  return new Promise((resolve) => {
    if (!windowId) {
      resolve();
      return;
    }
    chrome.windows.remove(windowId, () => {
      // The user may close the auth popup before cleanup runs.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function getPopupTabId(windowInfo = {}) {
  const tab = Array.isArray(windowInfo.tabs) ? windowInfo.tabs[0] : null;
  return tab?.id || 0;
}

function queryWindowTabs(windowId) {
  return new Promise((resolve) => {
    if (!windowId) {
      resolve([]);
      return;
    }
    chrome.tabs.query({ windowId }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

function inspectTabPage(tabId) {
  return new Promise((resolve) => {
    if (!tabId || !chrome.scripting?.executeScript) {
      resolve(null);
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        href: location.href,
        title: document.title || '',
        text: (document.body?.innerText || '').slice(0, 1200)
      })
    }, (results) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(results?.[0]?.result || null);
    });
  });
}

function detectOAuthErrorPage(page = null) {
  if (!page) return '';
  const content = `${page.title || ''}\n${page.text || ''}`;
  if (/无法获得该应用的访问权限|無法獲得該應用程式的存取權/i.test(content)) {
    return 'X says this account cannot obtain access to the app.';
  }
  if (/unable to obtain access to (this|the) app|can't obtain access to (this|the) app/i.test(content)) {
    return 'X says this account cannot obtain access to the app.';
  }
  if (/出错了|出了錯|something went wrong/i.test(content) && /应用|app|access|权限|存取權/i.test(content)) {
    return 'X returned an app authorization error page.';
  }
  return '';
}

function waitForOAuthPopup({ authUrl, redirectUri, timeoutMs = 3 * 60 * 1000 }) {
  return new Promise(async (resolve, reject) => {
    let popupWindowId = 0;
    let popupTabId = 0;
    let settled = false;
    let timeoutId = 0;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onTabRemoved);
      chrome.windows.onRemoved.removeListener(onWindowRemoved);
    };

    const settle = async (callback, value, shouldClose = true) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (shouldClose && popupWindowId) await removeWindow(popupWindowId);
      callback(value);
    };

    const isRedirectUrl = (url = '') => {
      return typeof url === 'string' && url.startsWith(redirectUri);
    };

    const isXPageUrl = (url = '') => /^https:\/\/(?:x|twitter)\.com\//i.test(url);

    const onUpdated = async (tabId, changeInfo = {}, tab = {}) => {
      if (tabId !== popupTabId) return;
      const nextUrl = changeInfo.url || tab.url || '';
      if (isRedirectUrl(nextUrl)) {
        settle(resolve, nextUrl);
        return;
      }
      if (changeInfo.status === 'complete' && isXPageUrl(nextUrl)) {
        const page = await inspectTabPage(tabId);
        const pageError = detectOAuthErrorPage(page);
        if (pageError) settle(reject, new Error(pageError), true);
      }
    };

    const onTabRemoved = (tabId) => {
      if (tabId === popupTabId) settle(reject, new Error('X authorization window was closed'), false);
    };

    const onWindowRemoved = (windowId) => {
      if (windowId === popupWindowId) settle(reject, new Error('X authorization window was closed'), false);
    };

    try {
      const windowInfo = await createPopupWindow({
        url: authUrl,
        type: 'popup',
        width: 520,
        height: 720,
        focused: true
      });
      popupWindowId = windowInfo.id || 0;
      popupTabId = getPopupTabId(windowInfo);
      if (!popupTabId) {
        const tabs = await queryWindowTabs(popupWindowId);
        popupTabId = tabs[0]?.id || 0;
      }
      if (!popupTabId) throw new Error('Unable to open X authorization window');

      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onTabRemoved);
      chrome.windows.onRemoved.addListener(onWindowRemoved);
      timeoutId = setTimeout(() => {
        settle(reject, new Error('X authorization timed out. Please try again.'), true);
      }, timeoutMs);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function normalizeXAuth(auth = {}) {
  return {
    connected: Boolean(auth.accessToken),
    clientId: normalizeXClientId(auth.clientId),
    accessToken: auth.accessToken || '',
    refreshToken: auth.refreshToken || '',
    expiresAt: Number(auth.expiresAt) || 0,
    scope: auth.scope || '',
    user: auth.user || null,
    connectedAt: Number(auth.connectedAt) || 0
  };
}

async function exchangeCodeForToken({ clientId, code, verifier, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });
  const response = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(withOAuthHint(`Token exchange failed (${response.status})`, data));
  if (!data.access_token) {
    throw new Error(`Token exchange returned no access_token. Callback URI: ${redirectUri}`);
  }
  return data;
}

async function refreshXToken(auth = {}) {
  const current = normalizeXAuth(auth);
  if (!current.refreshToken || !current.clientId) {
    throw new Error('X access has expired. Please reconnect X.');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: current.clientId,
    refresh_token: current.refreshToken
  });
  const response = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.detail || data.error || `Token refresh failed (${response.status})`);
  return {
    ...current,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || current.refreshToken,
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 0) - 60) * 1000,
    scope: data.scope || current.scope
  };
}

async function authorizeXWithRedirect({ clientId, redirectUri }) {
  const verifier = randomString(64);
  const challenge = await buildPkceChallenge(verifier);
  const state = randomString(24);
  const params = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: X_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  };
  const authUrl = buildAuthorizeUrl(params);
  const responseUrl = await waitForOAuthPopup({ authUrl, redirectUri });
  if (!responseUrl) {
    throw new Error(withOAuthSetupHint('X OAuth did not return a callback URL.', { clientId, redirectUri }));
  }
  const url = new URL(responseUrl);
  if (url.searchParams.get('state') !== state) throw new Error('X OAuth state mismatch');
  const error = url.searchParams.get('error');
  if (error) {
    throw new Error(withOAuthHint('X authorization rejected', {
      error,
      error_description: url.searchParams.get('error_description') || ''
    }));
  }
  const code = url.searchParams.get('code');
  if (!code) throw new Error(`X OAuth did not return a code. Check that the Callback URI exactly matches ${redirectUri}`);
  return { code, verifier, redirectUri };
}

async function connectXWithOAuth(clientId = '') {
  const cleanClientId = normalizeXClientId(clientId);
  if (!cleanClientId) throw new Error('Missing X OAuth Client ID');
  const redirectCandidates = getRedirectCandidates();
  const errors = [];
  let authorization = null;
  for (const redirectUri of redirectCandidates) {
    try {
      authorization = await authorizeXWithRedirect({
        clientId: cleanClientId,
        redirectUri
      });
      break;
    } catch (error) {
      const message = error.message || String(error);
      errors.push(`${redirectUri}: ${message}`);
      if (/state mismatch/i.test(message)) throw error;
    }
  }
  if (!authorization) {
    throw new Error(withOAuthSetupHint(`X OAuth failed for all Callback URIs. ${errors.join(' | ')}`, {
      clientId: cleanClientId,
      redirectUri: redirectCandidates.join(', ')
    }));
  }

  const token = await exchangeCodeForToken({
    clientId: cleanClientId,
    code: authorization.code,
    verifier: authorization.verifier,
    redirectUri: authorization.redirectUri
  });
  const auth = {
    connected: true,
    clientId: cleanClientId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || '',
    expiresAt: Date.now() + Math.max(0, Number(token.expires_in || 0) - 60) * 1000,
    scope: token.scope || X_SCOPES,
    user: null,
    connectedAt: Date.now()
  };
  const user = await getXMe(auth);
  if (!user?.id || !user?.username) {
    throw new Error('X profile lookup returned no authenticated user');
  }
  return {
    ...auth,
    user
  };
}

async function ensureValidXAuth(auth = {}) {
  const current = normalizeXAuth(auth);
  if (!current.accessToken) throw new Error('X is not connected');
  if (current.expiresAt && current.expiresAt > Date.now() + 60 * 1000) return current;
  return refreshXToken(current);
}

async function xApiFetch(auth = {}, path = '', params = {}) {
  const validAuth = await ensureValidXAuth(auth);
  const attempts = [];
  for (const baseUrl of X_API_BASES) {
    const url = new URL(`${baseUrl}${path}`);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${validAuth.accessToken}`
      }
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { data, auth: validAuth, endpoint: url.toString() };
    attempts.push({
      endpoint: url.toString(),
      status: response.status,
      message: data.detail || data.title || data.error || `X API failed (${response.status})`
    });
    if (response.status !== 401 && response.status !== 403) break;
  }
  const detail = attempts
    .map(attempt => `${attempt.endpoint} -> ${attempt.status} ${attempt.message}`)
    .join(' | ');
  const scope = validAuth.scope || 'unknown';
  throw new Error(`X API request failed. ${detail}. Token scope: ${scope}`);
}

async function getXMe(auth = {}) {
  try {
    const { data } = await xApiFetch(auth, '/users/me', {
      'user.fields': 'id,name,username,public_metrics,description,verified,profile_image_url'
    });
    return data.data || null;
  } catch (error) {
    throw new Error(`X profile check failed after token exchange: ${error.message || String(error)}`);
  }
}

function normalizeTweetMetrics(tweet = {}) {
  const publicMetrics = tweet.public_metrics || {};
  const organicMetrics = tweet.organic_metrics || {};
  const nonPublicMetrics = tweet.non_public_metrics || {};
  return {
    views: Number(organicMetrics.impression_count ?? nonPublicMetrics.impression_count ?? publicMetrics.impression_count) || 0,
    likes: Number(publicMetrics.like_count) || 0,
    replies: Number(publicMetrics.reply_count) || 0,
    reposts: Number(publicMetrics.retweet_count) || 0,
    bookmarks: Number(organicMetrics.bookmark_count ?? nonPublicMetrics.bookmark_count) || 0,
    follows: 0
  };
}

const PRIVATE_TWEET_FIELDS = 'created_at,public_metrics,organic_metrics,non_public_metrics,referenced_tweets,text,lang';
const PUBLIC_TWEET_FIELDS = 'created_at,public_metrics,referenced_tweets,text,lang';

function shouldRetryWithPublicTweetFields(error) {
  const message = String(error?.message || error || '');
  if (/rate limit/i.test(message)) return false;
  if (/\b402\b|credits?|quota/i.test(message) && !/organic_metrics|non_public_metrics/i.test(message)) return false;
  const hasAuthOrFieldFailure = /\b401\b|\b403\b|unauthorized|forbidden|organic_metrics|non_public_metrics|not permitted|not authorized/i.test(message);
  if (hasAuthOrFieldFailure) return true;
  return false;
}

async function xTweetFetch(auth = {}, path = '', params = {}, options = {}) {
  const privateFields = options.privateFields || PRIVATE_TWEET_FIELDS;
  const publicFields = options.publicFields || PUBLIC_TWEET_FIELDS;
  try {
    return await xApiFetch(auth, path, {
      ...params,
      'tweet.fields': privateFields
    });
  } catch (error) {
    if (!shouldRetryWithPublicTweetFields(error)) throw error;
    const result = await xApiFetch(auth, path, {
      ...params,
      'tweet.fields': publicFields
    });
    return {
      ...result,
      degraded: true,
      degradedReason: error.message || String(error)
    };
  }
}

async function getPostById(auth = {}, postId = '') {
  const { data, auth: nextAuth, degraded, degradedReason } = await xTweetFetch(auth, `/tweets/${postId}`);
  const tweet = data.data || null;
  if (!tweet) return { tweet: null, metrics: null, auth: nextAuth, degraded, degradedReason };
  return {
    tweet,
    metrics: normalizeTweetMetrics(tweet),
    auth: nextAuth,
    degraded,
    degradedReason
  };
}

async function getRecentUserPosts(auth = {}, userId = '', maxResults = 30, options = {}) {
  const { data, auth: nextAuth, degraded, degradedReason } = await xTweetFetch(auth, `/users/${userId}/tweets`, {
    max_results: Math.max(5, Math.min(Number(maxResults) || 30, 100)),
    exclude: 'retweets'
  });
  const posts = Array.isArray(data.data) ? data.data : [];
  return {
    posts: posts.map((tweet) => {
      const metrics = normalizeTweetMetrics(tweet);
      const actualViews = Number(metrics.views) || 0;
      return {
        id: tweet.id,
        text: tweet.text || '',
        actualViews,
        performanceMetrics: metrics,
        contentMode: Array.isArray(tweet.referenced_tweets) && tweet.referenced_tweets.some(ref => ref.type === 'replied_to') ? 'reply' : 'post',
        language: tweet.lang || '',
        statusId: tweet.id,
        reviewedAt: actualViews > 0 ? Date.now() : 0,
        createdAt: Date.parse(tweet.created_at) || Date.now()
      };
    }).filter(post => options.includeWithoutViews || post.actualViews > 0),
    auth: nextAuth,
    degraded,
    degradedReason
  };
}

export {
  connectXWithOAuth,
  ensureValidXAuth,
  getPostById,
  getRecentUserPosts,
  getXMe,
  getXOAuthRequestPreview,
  normalizeXClientId,
  normalizeXAuth
};
