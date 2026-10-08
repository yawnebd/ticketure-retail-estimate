# Ticketure Retail Estimate Form

Google Apps Script web app that collects retail/F&B client estimates and saves them to the
[Ticketure Retail Estimates](https://docs.google.com/spreadsheets/d/1W_7nLLNLjjQn_n0xsrjRdvCEC-cPKAL_pa4VxpFKSqk/edit) sheet (tab `Submissions`).

## Files
- `Code.gs` – server: serves the form, validates input, appends a row (calculated columns are row formulas)
- `Index.html` – form UI with live estimates, Submit and Reset
- `appsscript.json` – manifest (America/Denver, V8, web app: execute as deployer, Ticketure domain only)

## Setup
1. Open the sheet → Extensions → Apps Script.
2. Paste `Code.gs`; add an HTML file named `Index` and paste `Index.html`.
3. Project Settings → show `appsscript.json`, paste the manifest.
4. Deploy → New deployment → Web app (Execute as: Me, Access: Anyone within Ticketure).

## Sheet columns
Entered Date, Entered By, Status, Client Name, Locations, Devices per Location, Total Devices,
Credit Card Fee %, Volume Basis, Est. Sales Volume (as entered), Est. Annual Sales, Est. Monthly Sales,
Annual Card Fees, Monthly Card Fees, Annual Sales per Location, Annual Sales per Device,
Est. Launch Date, Days to Launch, Est. Products, Retail, Food & Beverage.
