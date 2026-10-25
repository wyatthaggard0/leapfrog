# Leapfrog

A check-in game for TCU BIS speaker events. Students scan a QR code, enter their name and section, and answer 7 BIS prompts in 25 seconds each. Rarer answers make the Horned Frog leap farther, from campus west toward the Pacific. Each finished game is saved as one attendance row that professors can read in Google Sheets.

## Run it locally

Requires Node 20.12 or newer. There are no npm dependencies.

```bash
npm run dev        # http://localhost:3000
npm test           # scoring tests
```

Without Google credentials, check-ins are saved to `data/responses.json`, so you can play and tweak right away.

To replay as a fresh student, clear the site's local storage in DevTools (Application → Local Storage), or change `EVENT.id` in the config.

## Edit the game

Everything lives in [config/game.js](config/game.js):

- **`SECTIONS`**: the check-in dropdown, plus one Sheet tab per section. Don't use apostrophes or `[ ] * ? : / \` in section names.
- **`PROMPTS`**: the 7 prompts. Each has answers in tiers from 1 (common, 10 pts) to 6 (rarest, 100 pts). Write each answer as `'Display Name|alias|alias'`. Matching ignores case, spaces and punctuation, forgives small typos and plurals, and drops "the" and "Microsoft".
- **`TIERS`**, **`MILESTONES`**, **`BIOMES`**: tier names, points, leap distances and flavor text; the towns along the route; the scenery changes.
- **`EVENT.id`**: change it for each new event so returning students start a new game.

Run `npm test` after editing answers. It fails if the same alias appears under two different answers.

## Connect Google Sheets

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, enable the **Google Sheets API**, then go to **IAM & Admin → Service Accounts**, create a service account, and download a **JSON key**.
2. Create a Google Sheet and **share it with the service account's email** (`…@….iam.gserviceaccount.com`) as **Editor**.
3. Copy `.env.example` to `.env` and fill in:
   - `SHEET_ID`: the long ID in the sheet URL
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: the whole key file on one line (or use the EMAIL and PRIVATE_KEY pair instead)
4. Run `npm run setup-sheet`. It creates these tabs:
   - **Responses**: the raw log (timestamp, name, section, score, raw answers, matched answers, points)
   - **Attendance**: every student, sorted Section → Last → First, with first check-in time
   - **One tab per section**: just that section's students, sorted by last name
   - **Unmatched**: answers that scored 0, for adding aliases later
5. Run `npm run dev` again. The console should say `Check-ins are saved to: Google Sheets`.

Duplicate plays by the same name and section appear once in Attendance and the section tabs.

## Deploy (GitHub → Vercel)

1. Push this repo to GitHub, then **Import** it in Vercel. No framework preset is needed; `vercel.json` serves `public/` and turns `api/` into functions.
2. In Vercel → Settings → Environment Variables, add `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` and `TIMEZONE`.
3. Deploy, then make a QR code for the URL and put it on the opening slide.

Google Sheets is required on Vercel because the local JSON fallback can't write there.

## Before the event

- Load test against a **test copy** of the sheet: `npm run simulate -- 100 https://your-app.vercel.app`, then delete the fake rows.
- Google's default quota is about **60 writes per minute** for one service account. If everyone finishes in the same minute, a few saves get delayed. The server retries with backoff, and the student's phone keeps retrying until the save lands ("Logging your leap…"), so nobody is lost. For classes of 150 or more, you can request a quota increase in Cloud Console (APIs & Services → Sheets API → Quotas).

## How it works

```
public/           static front end (vanilla JS, canvas pixel art drawn in code)
  app.js          screens, timer, check-in, results
  world.js        the pixel world: frog, tier landmarks, scenery
api/              Vercel functions (also run by dev-server.js)
  config.js       public game config (no answers)
  score.js        scores one answer for the instant reveal
  submit.js       re-scores everything server-side and saves the check-in
  stats.js        room-wide stats for the results screen
lib/              scoring, Google Sheets client, storage, stats
config/game.js    prompts, answers, sections, tiers
```

Answers are scored on the server, so the answer key never reaches the browser and students can't edit their own score.
