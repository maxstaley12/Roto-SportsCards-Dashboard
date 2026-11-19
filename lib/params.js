const CFG = require('./config');
const { LIST } = require('./brands');

const DAYMS = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const parseDay = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const ms = Date.parse(s + 'T00:00:00Z');
  return isNaN(ms) || isoDay(ms) !== s ? null : ms;
};

// Search Console data lags about two days; GA4 is fine but both sources share one window.
function latestAvailable(now) {
  return isoDay((now || Date.now()) - 2 * DAYMS);
}

// The window the dashboard opens on: from the launch date to the latest date with data.
// (If that is longer than CFG.maxDays, it becomes the most recent CFG.maxDays days.)
function defaultRange(now) {
  const end = latestAvailable(now);
  const capped = isoDay(parseDay(end) - (CFG.maxDays - 1) * DAYMS);
  const start = end < CFG.launchDate ? end : CFG.launchDate > capped ? CFG.launchDate : capped;
  return { start, end, sinceLaunch: start === CFG.launchDate };
}

// Turns ?scope=&start=&end= into a validated request. Throws an Error with .status = 400 on bad input.
// scope is "all" or a brand slug from lib/config.js.
function resolveParams(search, now) {
  const bad = (m) => { const e = new Error(m); e.status = 400; return e; };
  const scope = search.get('scope') || 'all';
  if (scope !== 'all' && !LIST.some((b) => b.slug === scope)) throw bad('Unknown view "' + scope + '".');

  const d = defaultRange(now);
  const start = search.get('start') || d.start;
  const end = search.get('end') || d.end;
  const s = parseDay(start), e = parseDay(end);
  if (s == null || e == null) throw bad('Dates must look like 2026-08-01.');
  if (s > e) throw bad('The start date is after the end date.');
  if (start < CFG.earliestStart) throw bad('The earliest start date is ' + CFG.earliestStart + '.');
  const latest = latestAvailable(now);
  if (end > latest) throw bad('Search Console data lags about two days, so the latest end date is ' + latest + '.');
  const days = Math.round((e - s) / DAYMS) + 1;
  if (days > CFG.maxDays) throw bad('Please pick a range of ' + CFG.maxDays + ' days or fewer.');

  // Previous period: same number of days, ending the day before the chosen start.
  const previous = { start: isoDay(s - days * DAYMS), end: isoDay(s - DAYMS) };
  return { scope, current: { start, end }, previous, days, latest, defaults: d };
}

module.exports = { resolveParams, latestAvailable, defaultRange, isoDay, parseDay, DAYMS };
