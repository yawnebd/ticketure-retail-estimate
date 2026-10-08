/**
 * Ticketure Retail Estimate form
 * Bound to the "Ticketure Retail Estimates" Google Sheet.
 * Deploy > New deployment > Web app.
 */

const SHEET_ID   = '1W_7nLLNLjjQn_n0xsrjRdvCEC-cPKAL_pa4VxpFKSqk';
const SHEET_NAME = 'Submissions';
const DEFAULT_STATUS = 'New';

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.userEmail = Session.getActiveUser().getEmail() || '';
  return t.evaluate()
    .setTitle('Retail Sales Estimate')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Shared calculation, mirrored in Index.html for the live preview. */
function calcEstimates_(d) {
  const totalDevices  = d.locations * d.devicesPerLocation;
  const annualSales   = d.volumeBasis === 'Monthly' ? d.salesVolume * 12 : d.salesVolume;
  const monthlySales  = annualSales / 12;
  const annualFees    = annualSales * d.feeRate;
  const monthlyFees   = annualFees / 12;
  const perLocation   = d.locations ? annualSales / d.locations : 0;
  const perDevice     = totalDevices ? annualSales / totalDevices : 0;
  return { totalDevices, annualSales, monthlySales, annualFees, monthlyFees, perLocation, perDevice };
}

/** Called from the form. Validates, appends one row, returns the estimates. */
function submitEstimate(form) {
  const d = {
    clientName:         String(form.clientName || '').trim(),
    locations:          Number(form.locations),
    devicesPerLocation: Number(form.devicesPerLocation),
    feeRate:            Number(form.ccFee) / 100,          // form takes 2.9 -> 0.029
    volumeBasis:        form.volumeBasis === 'Monthly' ? 'Monthly' : 'Annual',
    salesVolume:        Number(form.salesVolume),
    launchDate:         String(form.launchDate || ''),
    products:           Number(form.products),
    retail:             form.retail === true || form.retail === 'on',
    fnb:                form.fnb === true || form.fnb === 'on',
    enteredBy:          Session.getActiveUser().getEmail() || String(form.enteredBy || '').trim()
  };

  // Validation
  const errors = [];
  if (!d.clientName) errors.push('Client name is required.');
  if (!(d.locations >= 1)) errors.push('Number of locations must be at least 1.');
  if (!(d.devicesPerLocation >= 0)) errors.push('Devices per location must be 0 or more.');
  if (!(d.feeRate >= 0 && d.feeRate < 1)) errors.push('Credit card fee must be between 0 and 100%.');
  if (!(d.salesVolume >= 0)) errors.push('Sales volume must be 0 or more.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.launchDate)) errors.push('Launch date is required.');
  if (!(d.products >= 0)) errors.push('Number of products must be 0 or more.');
  if (!d.retail && !d.fnb) errors.push('Select Retail, Food and Beverage, or both.');
  if (!d.enteredBy) errors.push('Entered By is required.');
  if (errors.length) throw new Error(errors.join(' '));

  const [y, m, day] = d.launchDate.split('-').map(Number);
  const launch = new Date(y, m - 1, day);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const r = sh.getLastRow() + 1;
    // Calculated columns are row formulas so the sheet stays traceable if an input is corrected later.
    const row = [
      new Date(),                                  // A Entered Date
      d.enteredBy,                                 // B Entered By
      DEFAULT_STATUS,                              // C Status
      d.clientName,                                // D Client Name
      d.locations,                                 // E Locations
      d.devicesPerLocation,                        // F Devices per Location
      `=E${r}*F${r}`,                              // G Total Devices
      d.feeRate,                                   // H Credit Card Fee %
      d.volumeBasis,                               // I Volume Basis
      d.salesVolume,                               // J Est. Sales Volume (as entered)
      `=IF(I${r}="Monthly",J${r}*12,J${r})`,       // K Est. Annual Sales
      `=K${r}/12`,                                 // L Est. Monthly Sales
      `=K${r}*H${r}`,                              // M Annual Card Fees
      `=M${r}/12`,                                 // N Monthly Card Fees
      `=IF(E${r}=0,0,K${r}/E${r})`,                // O Annual Sales per Location
      `=IF(G${r}=0,0,K${r}/G${r})`,                // P Annual Sales per Device
      launch,                                      // Q Est. Launch Date
      `=Q${r}-INT(A${r})`,                         // R Days to Launch
      d.products,                                  // S Est. Products
      d.retail,                                    // T Retail
      d.fnb                                        // U Food & Beverage
    ];
    sh.getRange(r, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    return { row: r, client: d.clientName, results: calcEstimates_(d) };
  } finally {
    lock.releaseLock();
  }
}
