/**
 * Ticketure Retail Estimate – Apps Script server.
 * Bundled by scripts/build.ts into dist/Code.js. Only the functions exported here
 * are exposed as top-level Apps Script functions (see GAS_EXPORTS in the build).
 */
import {
  calcEstimates,
  clientKey,
  isValidSubmissionId,
  parseEstimate,
  type EstimateFormInput,
  type ExistingEstimate,
  type ServerApi,
  type SubmitResult,
} from '../shared/estimate';

const SHEET_ID = '1W_7nLLNLjjQn_n0xsrjRdvCEC-cPKAL_pa4VxpFKSqk';
const SHEET_NAME = 'Submissions';
const DEFAULT_STATUS = 'New';
const LOCK_TIMEOUT_MS = 20_000;
const MAX_EXISTING_SHOWN = 3;

/** 1-based column numbers in the Submissions tab. */
const COL = {
  enteredDate: 1, // A
  enteredBy: 2, // B
  clientName: 4, // D
  submissionId: 22, // V
} as const;

export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  const t = HtmlService.createTemplateFromFile('Index');
  t.userEmail = Session.getActiveUser().getEmail() || '';
  return t
    .evaluate()
    .setTitle('Retail Sales Estimate')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

export function submitEstimate(input: Partial<EstimateFormInput>): SubmitResult {
  // Identity always comes from the Google session, never from the form.
  const enteredBy = Session.getActiveUser().getEmail();
  if (!enteredBy) {
    throw new Error('Could not confirm who you are. Open the form while signed in to your Ticketure Google account.');
  }
  if (!isValidSubmissionId(input.submissionId)) {
    throw new Error('This form is out of date. Reload the page and enter the estimate again.');
  }

  const parsed = parseEstimate(input);
  if (!parsed.ok) throw new Error(parsed.errors.join(' '));
  const d = parsed.data;
  const estimates = calcEstimates(d);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error('The estimates sheet is busy. Wait a few seconds and save again.');
  }
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sh) throw new Error(`Sheet tab "${SHEET_NAME}" was not found.`);
    ensureSubmissionIdHeader_(sh);

    // 1) Same submission arriving twice (double click, retry, flaky network): return the original row.
    const priorRow = findSubmissionRow_(sh, input.submissionId);
    if (priorRow) {
      return { status: 'saved', row: priorRow, clientName: d.clientName, estimates, alreadySaved: true };
    }

    // 2) A different submission for a client that already has an estimate: ask before adding another.
    if (!input.allowExistingClient) {
      const existing = findClientRows_(sh, d.clientName);
      if (existing.length) return { status: 'confirm-existing-client', existing };
    }

    const r = sh.getLastRow() + 1;
    const [y, m, day] = d.launchDate.split('-').map(Number);
    // Calculated columns are row formulas so the sheet stays traceable if an input is corrected later.
    const row: unknown[] = [
      new Date(), //                              A Entered Date
      enteredBy, //                               B Entered By
      DEFAULT_STATUS, //                          C Status
      d.clientName, //                            D Client Name
      d.locations, //                             E Locations
      d.devicesPerLocation, //                    F Devices per Location
      `=E${r}*F${r}`, //                          G Total Devices
      d.feeRate, //                               H Credit Card Fee %
      d.volumeBasis, //                           I Volume Basis
      d.salesVolume, //                           J Est. Sales Volume (as entered)
      `=IF(I${r}="Monthly",J${r}*12,J${r})`, //   K Est. Annual Sales
      `=K${r}/12`, //                             L Est. Monthly Sales
      `=K${r}*H${r}`, //                          M Annual Card Fees
      `=M${r}/12`, //                             N Monthly Card Fees
      `=IF(E${r}=0,0,K${r}/E${r})`, //            O Annual Sales per Location
      `=IF(G${r}=0,0,K${r}/G${r})`, //            P Annual Sales per Device
      new Date(y, m - 1, day), //                 Q Est. Launch Date
      `=Q${r}-INT(A${r})`, //                     R Days to Launch
      d.products, //                              S Est. Products
      d.retail, //                                T Retail
      d.fnb, //                                   U Food & Beverage
      input.submissionId, //                      V Submission ID
    ];
    sh.getRange(r, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    return { status: 'saved', row: r, clientName: d.clientName, estimates, alreadySaved: false };
  } finally {
    lock.releaseLock();
  }
}

// Compile-time check that the browser's view of the server API matches the real functions.
void ({ submitEstimate } satisfies ServerApi);

function ensureSubmissionIdHeader_(sh: GoogleAppsScript.Spreadsheet.Sheet): void {
  const header = sh.getRange(1, COL.submissionId);
  if (header.getValue() === '') header.setValue('Submission ID');
}

function findSubmissionRow_(sh: GoogleAppsScript.Spreadsheet.Sheet, id: string): number | null {
  const last = sh.getLastRow();
  if (last < 2) return null;
  const hit = sh
    .getRange(2, COL.submissionId, last - 1, 1)
    .createTextFinder(id)
    .matchEntireCell(true)
    .findNext();
  return hit ? hit.getRow() : null;
}

function findClientRows_(sh: GoogleAppsScript.Spreadsheet.Sheet, clientName: string): ExistingEstimate[] {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const key = clientKey(clientName);
  const values = sh.getRange(2, 1, last - 1, COL.clientName).getValues();
  const matches: ExistingEstimate[] = [];
  for (let i = values.length - 1; i >= 0 && matches.length < MAX_EXISTING_SHOWN; i--) {
    const v = values[i];
    if (clientKey(String(v[COL.clientName - 1])) !== key) continue;
    const date = v[COL.enteredDate - 1];
    matches.push({
      row: i + 2,
      clientName: String(v[COL.clientName - 1]),
      enteredBy: String(v[COL.enteredBy - 1]),
      enteredDate: date instanceof Date ? date.toISOString() : String(date),
    });
  }
  return matches;
}
