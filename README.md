# Leapfrog

A check-in game for TCU BIS speaker events. Students scan a QR code, enter their first and last name, and answer 7 BIS prompts in 25 seconds each. Rarer answers make the Horned Frog leap farther, from campus west toward the Pacific. Each finished game is saved as one attendance row that professors can read in Google Sheets.

## Run it locally

Requires Node 20.12 or newer. There are no npm dependencies.

```bash
npm run dev        # http://localhost:3000 (or the next free port)
npm test           # scoring tests
```

On Windows PowerShell, if `npm` is blocked by the execution policy, run `node dev-server.js` (or `npm.cmd run dev`) instead.

Without Google credentials, check-ins are saved to `data/responses.json`, so you can play and tweak right away.

To replay as a fresh student, clear the site's local storage in DevTools (Application → Local Storage), or change `EVENT.id` in the config.

## Edit the game

Game settings live in [config/game.js](config/game.js):

- **`PROMPTS`**: the 7 prompt texts, each tied to an answer set by `slug`.
- **`TIERS`**, **`MILESTONES`**, **`BIOMES`**: tier names, points, leap distances and flavor text; the towns along the route; the scenery changes.
- **`EVENT.id`**: change it for each new event so returning students start a new game.

## Answer data (how rarity works)

Like Krillion, each prompt's answers are aggregated from real sources and then cleaned into one set:

| Prompt | Sources |
|---|---|
| Careers | TCU Neeley BIS pages, BLS Occupational Outlook Handbook, O*NET, industry titles |
| Double majors | TCU's full undergraduate majors list, plus common majors elsewhere |
| Excel functions | Microsoft's complete Excel function list (about 500) |
| Languages | Wikipedia's list of programming languages, plus query languages |
| Data/BI tools | Wikipedia BI and DBMS lists, DB-Engines ranking, statistical packages, ETL tools |
| Cyber threats | Wikipedia malware and attack lists, MITRE ATT&CK, OWASP Top 10 |
| Companies | Fortune 500, Big Four and consulting firms, DFW's largest employers |

The raw sets live in `data/sources/<slug>.json`. Each entry has a name, aliases, an optional Wikipedia title and an optional pinned tier.

`npm run build-answers` turns them into `config/answers/*.json`:

- **Pinned tiers** win. This is the manual pass for what students actually type first. For example, Finance is pinned at tier 1 for double majors.
- **Everything else is ranked by 12 months of Wikipedia pageviews**, a familiarity signal, into tiers 3–6: the top 12% go to tier 3, the next 28% to tier 4, the next 30% to tier 5, and the rest to tier 6. Tiers 1–2 come only from pins, because Wikipedia fame (Stuxnet, say) isn't what students type first.
- Pageviews are cached in `data/cache/pageviews.json`. Delete the file to refresh them.

To add a missing answer, add it to the source file and rerun the build. The **Unmatched** Sheet tab shows what students typed that didn't match.

### Matching (autocorrect)

- Case, spaces and punctuation are ignored, so `=VLOOKUP(` and `v lookup` both count.
- **Answers are found inside phrases.** "Finance and BIS" or "I'd say Python" still match, and longer answers win ("index match" beats "index").
- **Typos are forgiven, scaled by length:** 1 for 4–6 letters, 2 for 7–11, 3 for 12 or more. Swapped neighbours count as one typo, plurals are ignored, and all aliases are checked.
- Weird matches are damped: a different first letter costs extra, and typos can never exceed a third of the word.

Run `npm test` after changing answer data.

## Connect Google Sheets

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, enable the **Google Sheets API**, then go to **IAM & Admin → Service Accounts**, create a service account, and download a **JSON key**.
2. Create a Google Sheet and **share it with the service account's email** (`…@….iam.gserviceaccount.com`) as **Editor**.
3. Copy `.env.example` to `.env` and fill in:
   - `SHEET_ID`: the long ID in the sheet URL
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: the whole key file on one line (or use the EMAIL and PRIVATE_KEY pair instead)
4. Run `npm run setup-sheet`. It creates these tabs:
   - **Attendance**: every student who finished, sorted by last name then first name, with check-in time
   - **Responses**: the raw log (timestamp, name, score, raw answers, matched answers, points)
   - **Unmatched**: answers that scored 0, for adding aliases later
5. Run `npm run dev` again. The console should say `Check-ins are saved to: Google Sheets`.

If someone plays twice under the same name, Attendance lists them once.

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
config/game.js    prompts, tiers, route
config/answers/   generated answer sets (npm run build-answers)
data/sources/     aggregated raw answer lists
```

Answers are scored on the server, so the answer key never reaches the browser and students can't edit their own score.
