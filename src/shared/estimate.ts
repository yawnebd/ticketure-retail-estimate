/**
 * Single source of truth for the estimate form: input shape, validation and math.
 * Bundled into both the Apps Script server (Code.js) and the browser (Index.html).
 * The sheet formulas written in src/server/main.ts mirror `calcEstimates`.
 */

export type VolumeBasis = 'Annual' | 'Monthly';

/** What the browser sends. Numbers stay as strings so blanks are detectable. */
export interface EstimateFormInput {
  submissionId: string;
  clientName: string;
  locations: string;
  devicesPerLocation: string;
  ccFee: string; // percent, e.g. "2.9"
  volumeBasis: VolumeBasis;
  salesVolume: string;
  launchDate: string; // yyyy-mm-dd
  products: string;
  retail: boolean;
  fnb: boolean;
  eventManagement: boolean;
  /** Set after the user confirms they want a second estimate for an existing client. */
  allowExistingClient?: boolean;
}

/** Validated, typed values. */
export interface EstimateData {
  clientName: string;
  locations: number;
  devicesPerLocation: number;
  feeRate: number; // fraction, e.g. 0.029
  volumeBasis: VolumeBasis;
  salesVolume: number;
  launchDate: string;
  products: number;
  retail: boolean;
  fnb: boolean;
  eventManagement: boolean;
}

export interface Estimates {
  totalDevices: number;
  annualSales: number;
  monthlySales: number;
  annualFees: number;
  monthlyFees: number;
  perLocation: number;
  perDevice: number;
}

export interface ExistingEstimate {
  row: number;
  clientName: string;
  enteredBy: string;
  enteredDate: string; // ISO
}

export type SubmitResult =
  | { status: 'saved'; row: number; clientName: string; estimates: Estimates; alreadySaved: boolean }
  | { status: 'confirm-existing-client'; existing: ExistingEstimate[] };

export type ParseResult = { ok: true; data: EstimateData } | { ok: false; errors: string[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9-]{16,64}$/;

/** Blank → NaN (unlike Number(''), which is 0). */
function num(value: unknown): number {
  const s = String(value ?? '').trim();
  return s === '' ? NaN : Number(s);
}

const isWhole = (n: number, min: number) => Number.isInteger(n) && n >= min;

export function isValidSubmissionId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

/** Normalised form of a client name for duplicate matching. */
export function clientKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function parseEstimate(input: Partial<EstimateFormInput>): ParseResult {
  const clientName = String(input.clientName ?? '').trim().replace(/\s+/g, ' ');
  const locations = num(input.locations);
  const devicesPerLocation = num(input.devicesPerLocation);
  const ccFee = num(input.ccFee);
  const salesVolume = num(input.salesVolume);
  const products = num(input.products);
  const launchDate = String(input.launchDate ?? '');
  const retail = input.retail === true;
  const fnb = input.fnb === true;
  const eventManagement = input.eventManagement === true;

  const errors: string[] = [];
  if (!clientName) errors.push('Enter the client name.');
  if (!isWhole(locations, 1)) errors.push('Number of locations must be a whole number of 1 or more.');
  if (!isWhole(devicesPerLocation, 0)) errors.push('Devices per location must be a whole number of 0 or more.');
  if (!(ccFee >= 0 && ccFee < 100)) errors.push('Credit card fee must be between 0 and 100%.');
  if (!(salesVolume >= 0)) errors.push('Enter the estimated sales volume.');
  if (!DATE_RE.test(launchDate) || Number.isNaN(Date.parse(launchDate))) errors.push('Enter the estimated launch date.');
  if (!isWhole(products, 0)) errors.push('Number of products must be a whole number of 0 or more.');
  if (!retail && !fnb && !eventManagement) errors.push('Select at least one business type.');
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      clientName,
      locations,
      devicesPerLocation,
      feeRate: Number((ccFee / 100).toPrecision(12)), // 2.9 -> 0.029 without float noise
      volumeBasis: input.volumeBasis === 'Monthly' ? 'Monthly' : 'Annual',
      salesVolume,
      launchDate,
      products,
      retail,
      fnb,
      eventManagement,
    },
  };
}

export function calcEstimates(d: Pick<EstimateData, 'locations' | 'devicesPerLocation' | 'feeRate' | 'volumeBasis' | 'salesVolume'>): Estimates {
  const totalDevices = d.locations * d.devicesPerLocation;
  const annualSales = d.volumeBasis === 'Monthly' ? d.salesVolume * 12 : d.salesVolume;
  const annualFees = annualSales * d.feeRate;
  return {
    totalDevices,
    annualSales,
    monthlySales: annualSales / 12,
    annualFees,
    monthlyFees: annualFees / 12,
    perLocation: d.locations ? annualSales / d.locations : 0,
    perDevice: totalDevices ? annualSales / totalDevices : 0,
  };
}

/** Whole days from today (local) to a yyyy-mm-dd date; null if no date. */
export function daysUntil(isoDate: string, today: Date = new Date()): number | null {
  if (!DATE_RE.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / 86_400_000);
}

/** Functions the browser may call through google.script.run. The server checks it satisfies this. */
export interface ServerApi {
  submitEstimate(input: EstimateFormInput): SubmitResult;
}
