// Everything you might change week to week lives here.
// Dates are inclusive. The comparison period is always the period of equal length that ends the day before the chosen start.
module.exports = {
  propertyId: 'properties/249838960',
  siteUrl: 'https://www.rotowire.com/',

  section: '/sports-cards',      // every page under this path is in the report
  keyEvent: 'exit_click_goal',   // GA4 key event (counted once per session) used as the "conversion"
  keyEventLabel: 'Exit-click sessions',

  // The window the dashboard opens on: from `launchDate` (first day with traffic) to the latest date with data.
  // The end moves forward by itself, so there is nothing to update day to day. If the range ever gets longer
  // than `maxDays`, the start moves forward so the window stays at `maxDays`.
  launchDate: '2026-10-16',
  earliestStart: '2024-01-01',   // date pickers and the API refuse anything earlier
  maxDays: 366,                  // longest range allowed in one view

  topPages: 250,                 // rows in the page tables
  topQueries: 400,               // rows in the search query table (one row per query and landing page)
  gscRows: 25000,                // Search Console rows fetched per request (the API maximum)

  // Pages that exist in the section but are not live content. They are left out of every number.
  excludePrefixes: ['/sports-cards/templates'],

  // ---- Pages (the view toggle, the page comparison table and the pies). The key is still called "brands" in code. ----
  // Each landing page goes to the FIRST page whose pattern matches its lowercase path (query string removed,
  // trailing slash removed). Pages that match none go to "Other /sports-cards pages", so a new page under
  // /sports-cards shows up in the totals automatically and appears under Other until you give it a line here.
  brands: [
    { slug: 'hub',             label: 'Hub',               re: '^/sports-cards$' },
    { slug: 'apps',            label: 'Apps',              re: '^/sports-cards/apps(/|$)' },
    { slug: 'promo-codes',     label: 'Promo Codes',       re: '^/sports-cards/promo-codes(/|$)' },
    { slug: 'underdog-rips',   label: 'Underdog Rips',     re: '^/sports-cards/underdog-rips(/|$)' },
    { slug: 'rips-by-triumph', label: 'Rips by Triumph',   re: '^/sports-cards/rips-by-triumph(/|$)' },
    { slug: 'prizepicks-packs',label: 'PrizePicks Packs',  re: '^/sports-cards/prizepicks-packs(/|$)' },
    { slug: 'trove',           label: 'Trove',             re: '^/sports-cards/trove(/|$)' },
    { slug: 'arena-club',      label: 'Arena Club',        re: '^/sports-cards/arena-club(/|$)' },
    { slug: 'courtyard',       label: 'Courtyard',         re: '^/sports-cards/courtyard(/|$)' },
    { slug: 'tilt-rips',       label: 'Tilt Rips',         re: '^/sports-cards/tilt-rips(/|$)' },
    { slug: 'packz',           label: 'Packz',             re: '^/sports-cards/packz(/|$)' },
  ],
  otherBrand: { slug: 'other', label: 'Other /sports-cards pages' },
};
