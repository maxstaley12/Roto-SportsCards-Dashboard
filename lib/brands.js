const CFG = require('./config');

const rules = CFG.brands.map((b) => ({ ...b, rx: new RegExp(b.re) }));
const OTHER = CFG.otherBrand;
const LIST = CFG.brands.concat([OTHER]);

// "https://www.rotowire.com/sports-cards/apps/?x=1" or "/sports-cards/apps?x=1" -> "/sports-cards/apps"
function toPath(u) {
  let p = String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

// Which brand a landing page belongs to (first matching rule wins).
function brandOf(path) {
  const p = toPath(path);
  for (const r of rules) if (r.rx.test(p)) return r;
  return OTHER;
}

const isExcluded = (path) => CFG.excludePrefixes.some((x) => toPath(path).startsWith(x));

module.exports = { toPath, brandOf, isExcluded, LIST, OTHER };
