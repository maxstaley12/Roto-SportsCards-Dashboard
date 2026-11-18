# Sports Cards Tracker (Vercel)

Password-protected dashboard for everything under rotowire.com/sports-cards/ (card-rip hub, apps page and the brand pages; each is a page): GA4 sessions, the `exit_click_goal` key event, and Search Console, compared with the previous period.
Built on the same pattern as the football and basketball dashboards: a small server function on Vercel signs in to Google with an OAuth refresh token.

## What it shows

* **Views:** All /sports-cards, or one page (Hub, Apps, Underdog Rips, Rips by Triumph, PrizePicks Packs, Trove, Arena Club, Courtyard, Tilt Rips, Packz).
* **Dates:** defaults to the last 90 days ending two days ago (Search Console lag), and moves forward by itself. Date pickers and quick ranges (28 days, 3, 6, 12 months) change it.
* **Comparison:** always the previous period, the same number of days ending the day before the chosen start.
* **Conversion stand-in:** the GA4 `exit_click_goal` key event (counted once per session, credited to the landing page). Shown as exit-click sessions and exit-click rate (exit-click sessions / sessions).
* **Traffic:** all channels. No separate organic figure, since nearly all of this traffic is search.
* **Sections:** overview tiles, weekly (or daily, for ranges of 21 days or fewer) charts, a page comparison table with pies (All view), landing pages by sessions, top pages by search clicks, and top search queries.
* A link keeps the view: `?scope=packz&start=2026-09-01&end=2026-11-16`. Links without dates keep following the default range.

## Deploy

1. Push this repo to GitHub and import it at vercel.com/new (same team as the other dashboards).
2. Add the same environment variables as the football dashboard (Production, Preview and Development):

   | Name | Value |
   |---|---|
   | GOOGLE_CLIENT_ID | the OAuth client ID from Google Cloud |
   | GOOGLE_CLIENT_SECRET | the OAuth client secret |
   | GOOGLE_REFRESH_TOKEN | the refresh token (the Google account must see the RotoWire GA4 property and Search Console site) |
   | DASHBOARD_PASSWORD | the password people type to view the report |
   | AUTH_SALT | optional, any random string |

3. Deploy, open the URL, sign in, and check the numbers (below). `/api/diag` (signed in) shows which step of the Google connection fails.

Never commit these values. `.env` files are ignored by `.gitignore`.

## Updating things (all in `lib/config.js`)

* **Add a page (a brand, promo, etc.):** add a line to `brands` (slug, label, URL pattern). Until you do, a new page under /sports-cards shows up in the totals under "Other /sports-cards pages".
* **Leave a URL out of every number:** add its prefix to `excludePrefixes` (currently the `/sports-cards/templates` template page).
* **Default range length:** `defaultDays` (90).
* **Different key event:** change `keyEvent` (and `keyEventLabel`). To use real conversions later, add the event as a GA4 key event and point `keyEvent` at it.

Data is cached for 6 hours per date range (one fetch serves every page view). Add `&refresh=1` to `/api/data?...` to force a refresh.

## Checking it against GA4

For a range, the All view's Sessions and Exit-click sessions should equal GA4 sessions and key events `exit_click_goal`, filtered to landing page containing /sports-cards (template page excluded), all channels. Search clicks come from Search Console filtered to page URLs under /sports-cards/.
Totals for search clicks are summed from page rows, so they can differ slightly from the Search Console screen.

## Local testing

`npm install`, copy `.env.example` to `.env.local`, fill it in, then `npm run dev`. `MOCK=1` shows fake data (layout testing only, no Google calls).

Vercel's free Hobby plan is for non-commercial use. For company work, use a Pro plan or a team.
