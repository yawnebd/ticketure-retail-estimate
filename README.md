# Ticketure Retail Estimate Form

Google Apps Script web app that collects retail/F&B client estimates and saves them to the
[Ticketure Retail Estimates](https://docs.google.com/spreadsheets/d/1W_7nLLNLjjQn_n0xsrjRdvCEC-cPKAL_pa4VxpFKSqk/edit) sheet (tab `Submissions`).

Written in TypeScript with Tailwind CSS. A Node build bundles it into the three files Apps Script
expects and `clasp` uploads them.

## Layout

```
src/shared/estimate.ts   input types, validation and estimate math (used by server and browser)
src/server/main.ts       doGet + submitEstimate: identity, duplicate checks, row append
src/client/index.html    form markup (Tailwind classes, HtmlService template)
src/client/main.ts       live estimates, saving, duplicate prompts
src/client/styles.css    Tailwind v4 entry and theme tokens
scripts/build.ts         builds dist/Code.js, dist/Index.html (CSS + JS inlined), dist/appsscript.json
test/                    unit tests for the shared logic (node:test)
```

## Duplicate prevention

1. **Same submission twice** (double click, Enter pressed twice, retry after a timeout): the browser
   ignores clicks while a save is in flight, and every estimate carries a submission ID that is only
   replaced after a successful save or Clear form. The server looks that ID up in column W under a
   script lock and, if it is already there, returns the existing row instead of adding another.
2. **Same client entered again**: before appending, the server checks column D for the client name
   (ignoring case, spacing and punctuation). If a match exists, the form lists the existing rows and
   asks whether to save another estimate.

`Entered By` is always taken from the signed-in Google account; the server no longer accepts it from
the form.

## Setup

Requires Node 20+.

```bash
npm install
npx clasp login
cp .clasp.json.example .clasp.json   # paste the Script ID (Apps Script → Project Settings)
npm run push                          # typecheck, build, upload dist/
```

Then in Apps Script: Deploy → Manage deployments → edit the web app → New version
(or `npm run deploy` to create a new deployment).

`npm run push` replaces the project's files with `dist/`, so remove the old `Code.gs` and `Index`
from the Apps Script editor if they remain.

## Sheet columns

Entered Date, Entered By, Status, Client Name, Locations, Devices per Location, Total Devices,
Credit Card Fee %, Volume Basis, Est. Sales Volume (as entered), Est. Annual Sales, Est. Monthly Sales,
Annual Card Fees, Monthly Card Fees, Annual Sales per Location, Annual Sales per Device,
Est. Launch Date, Days to Launch, Est. Products, Retail, Food & Beverage, Event Management (V), **Submission ID** (W).

The server fills in the `Event Management` (V1) and `Submission ID` (W1) headers if they are empty.
Keep column W in place; the duplicate check reads it. If an older sheet still has Submission ID in V,
the form refuses to save and asks you to insert a column at V first.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Type-checks server, browser and build code separately |
| `npm run build` | Typecheck, then build `dist/` |
| `npm test` | Unit tests for validation and math |
| `npm run push` | Build and `clasp push` |
| `npm run deploy` | Push and create a new deployment |
