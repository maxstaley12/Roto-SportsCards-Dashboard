const CFG = require('./config');
const mock = require('./mock');

const EMPTY = { value: null, expires: 0, at: 0 };
let tokenCache = EMPTY;
let inflight = null; // one sign-in at a time, shared by every query that starts together

async function fetchToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google credentials are not set (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN).');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID.trim(),
      client_secret: GOOGLE_CLIENT_SECRET.trim(),
      refresh_token: GOOGLE_REFRESH_TOKEN.trim(),
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    // Never echo secrets; Google's error codes (invalid_grant etc.) are safe to show.
    throw new Error('Google sign-in failed: ' + (json.error || res.status) + (json.error_description ? ' (' + json.error_description + ')' : ''));
  }
  tokenCache = { value: json.access_token, expires: Date.now() + Math.max(60, (json.expires_in || 3600) - 300) * 1000, at: Date.now() };
  return tokenCache.value;
}

async function accessToken(force) {
  if (!force && tokenCache.value && Date.now() < tokenCache.expires) return tokenCache.value;
  if (!inflight) inflight = fetchToken().finally(() => { inflight = null; });
  return inflight;
}

// ---- request plumbing ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAITS = [500, 1500, 3500]; // pauses before retries 2, 3 and 4 when Google answers 401
const MAX_PARALLEL = 4;          // Google calls in flight at once (was 12)
const BREAKER_MS = 20000;        // after a call gives up, the rest of the page's calls fail fast for this long

let active = 0;
const waiting = [];
function takeSlot() {
  return new Promise((resolve) => {
    const go = () => { active++; resolve(); };
    if (active < MAX_PARALLEL) go(); else waiting.push(go);
  });
}
function freeSlot() {
  active--;
  const next = waiting.shift();
  if (next) next();
}

let broken = null; // { at, err } set when a call has used up every retry

async function tokenDetail(token) {
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    return 'Google token check ' + r.status + (j.error_description || j.error ? ' (' + (j.error_description || j.error) + ')' : '') + (j.expires_in ? ', ' + j.expires_in + 's left' : '');
  } catch (e) {
    return 'Google token check unreachable';
  }
}

async function send(url, body) {
  const api = url.indexOf('analyticsdata') > -1 ? 'GA4' : 'Search Console';
  const notes = [];
  for (let i = 0; i <= WAITS.length; i++) {
    if (broken && Date.now() - broken.at < BREAKER_MS) throw broken.err;
    const token = await accessToken(false);
    const age = tokenCache.value === token ? Math.round((Date.now() - tokenCache.at) / 1000) + 's' : 'unknown age';
    const res = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status !== 401) {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (json.error && (json.error.message || json.error)) || res.status;
        throw new Error('Google API error [' + api + ' ' + res.status + ']: ' + msg);
      }
      broken = null;
      return json;
    }
    notes.push('try ' + (i + 1) + ' refused, token ' + age + ' old');
    // Throw away the token only if it is still the current one; a late 401 must not wipe a newer, good token.
    if (tokenCache.value === token) tokenCache = EMPTY;
    if (i < WAITS.length) { await sleep(WAITS[i]); continue; }
    const detail = await tokenDetail(token);
    const err = new Error('Google API error [' + api + ' 401]: Request had invalid authentication credentials (gave up after ' + (i + 1) + ' tries: ' + notes.join('; ') + '; ' + detail + ')');
    broken = { at: Date.now(), err };
    throw err;
  }
}

async function post(url, body) {
  await takeSlot();
  try { return await send(url, body); } finally { freeSlot(); }
}

// GA4 Data API runReport. Returns the raw API response ({rows: [...]}).
async function ga4Report(body) {
  if (process.env.MOCK === '1') return mock.ga4Report(body);
  return post('https://analyticsdata.googleapis.com/v1beta/' + CFG.propertyId + ':runReport', body);
}

// Search Console searchAnalytics.query. Returns the raw API response ({rows: [...]}).
async function gscQuery(body) {
  if (process.env.MOCK === '1') return mock.gscQuery(body);
  const site = encodeURIComponent(CFG.siteUrl);
  return post('https://searchconsole.googleapis.com/webmasters/v3/sites/' + site + '/searchAnalytics/query', body);
}

// Health check behind the password gate: shows which step of the Google connection fails. Never returns secrets or tokens.
async function diagnose() {
  const env = process.env;
  const out = {
    time: new Date().toISOString(),
    env: {
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ? { set: true, length: env.GOOGLE_CLIENT_ID.length, endsWith: env.GOOGLE_CLIENT_ID.trim().slice(-30), hasStraySpaces: env.GOOGLE_CLIENT_ID !== env.GOOGLE_CLIENT_ID.trim() } : { set: false },
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ? { set: true, length: env.GOOGLE_CLIENT_SECRET.length, startsWith: env.GOOGLE_CLIENT_SECRET.trim().slice(0, 6), hasStraySpaces: env.GOOGLE_CLIENT_SECRET !== env.GOOGLE_CLIENT_SECRET.trim() } : { set: false },
      GOOGLE_REFRESH_TOKEN: env.GOOGLE_REFRESH_TOKEN ? { set: true, length: env.GOOGLE_REFRESH_TOKEN.length, startsWith: env.GOOGLE_REFRESH_TOKEN.trim().slice(0, 3), hasStraySpaces: env.GOOGLE_REFRESH_TOKEN !== env.GOOGLE_REFRESH_TOKEN.trim() } : { set: false },
    },
  };
  if (env.MOCK === '1') { out.mock = true; return out; }
  const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = { ok: false, error: String(e && e.message ? e.message : e) }; } };
  let token = null;
  await step('refresh', async () => {
    tokenCache = EMPTY;
    broken = null;
    token = await accessToken(true);
    return { ok: true };
  });
  if (!token) return out;
  await step('tokenInfo', async () => {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, scopes: j.scope ? String(j.scope).split(' ') : null, expiresInSeconds: j.expires_in ? Number(j.expires_in) : null, error: j.error_description || j.error || null };
  });
  await step('ga4', async () => {
    const r = await fetch('https://analyticsdata.googleapis.com/v1beta/' + CFG.propertyId + ':runReport', {
      method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'sessions' }], limit: '1' }),
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, message: r.ok ? null : (j.error && j.error.message) || null };
  });
  await step('searchConsole', async () => {
    const r = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } });
    const j = await r.json().catch(() => ({}));
    const site = (j.siteEntry || []).find((x) => x.siteUrl === CFG.siteUrl);
    return { status: r.status, ok: r.ok, sitesVisible: (j.siteEntry || []).length, rotowireSite: site ? site.permissionLevel : 'not visible to this Google account', message: r.ok ? null : (j.error && j.error.message) || null };
  });

  // Same code path the dashboard uses (shared token, retries, parallel limit), so a pass here means the dashboard should load.
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const tinyGa4 = { dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'sessions' }], limit: '1' };
  const tinyGsc = { startDate: day(10), endDate: day(4), rowLimit: 1 };
  await step('dashboardPathGa4', async () => { await ga4Report(tinyGa4); return { ok: true }; });
  await step('dashboardPathSearchConsole', async () => { await gscQuery(tinyGsc); return { ok: true }; });
  await step('burstOf12', async () => {
    const jobs = [];
    for (let i = 0; i < 12; i++) jobs.push(i % 2 ? ga4Report(tinyGa4) : gscQuery(tinyGsc));
    const rs = await Promise.allSettled(jobs);
    const bad = rs.filter((r) => r.status === 'rejected');
    return { ok: bad.length === 0, passed: rs.length - bad.length, failed: bad.length, firstError: bad[0] ? String(bad[0].reason && bad[0].reason.message).slice(0, 400) : null };
  });
  return out;
}

module.exports = { ga4Report, gscQuery, diagnose };
