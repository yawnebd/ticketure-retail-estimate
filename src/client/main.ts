import {
  calcEstimates,
  daysUntil,
  parseEstimate,
  type EstimateFormInput,
  type Estimates,
  type ExistingEstimate,
  type ServerApi,
  type SubmitResult,
} from '../shared/estimate';

// ---------- DOM ----------
const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const form = $<HTMLFormElement>('estimate-form');
const saveBtn = $<HTMLButtonElement>('save');
const clearBtn = $<HTMLButtonElement>('clear');
const statusEl = $<HTMLParagraphElement>('status');
const existingBox = $<HTMLDivElement>('existing-client');
const existingTitle = $<HTMLParagraphElement>('existing-client-title');
const existingList = $<HTMLUListElement>('existing-client-list');
const confirmExistingBtn = $<HTMLButtonElement>('confirm-existing');
const cancelExistingBtn = $<HTMLButtonElement>('cancel-existing');

const field = (id: string) => $<HTMLInputElement>(id);
const NUMERIC_FIELDS = ['locations', 'devicesPerLocation', 'ccFee', 'salesVolume', 'products'] as const;

// ---------- Server bridge ----------
function callServer<K extends keyof ServerApi>(
  name: K,
  ...args: Parameters<ServerApi[K]>
): Promise<ReturnType<ServerApi[K]>> {
  return new Promise((resolve, reject) => {
    google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[name](...args);
  });
}

// ---------- Duplicate guards ----------
/**
 * One id per estimate being entered. Retries and double clicks reuse it, so the server
 * can recognise them; it only changes after a successful save or a clear.
 */
let submissionId = newId();
let saving = false;

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// ---------- Form state ----------
function readForm(): EstimateFormInput {
  const checked = form.querySelector<HTMLInputElement>('input[name=volumeBasis]:checked');
  return {
    submissionId,
    clientName: field('clientName').value,
    locations: field('locations').value,
    devicesPerLocation: field('devicesPerLocation').value,
    ccFee: field('ccFee').value,
    volumeBasis: checked?.value === 'Monthly' ? 'Monthly' : 'Annual',
    salesVolume: field('salesVolume').value,
    launchDate: field('launchDate').value,
    products: field('products').value,
    retail: field('retail').checked,
    fnb: field('fnb').checked,
  };
}

// ---------- Live estimates ----------
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function render(): void {
  const f = readForm();
  const n = (v: string) => Number(v) || 0;
  const e: Estimates = calcEstimates({
    locations: n(f.locations),
    devicesPerLocation: n(f.devicesPerLocation),
    feeRate: n(f.ccFee) / 100,
    volumeBasis: f.volumeBasis,
    salesVolume: n(f.salesVolume),
  });
  const set = (id: string, text: string) => ($(`o_${id}`).textContent = text);
  set('totalDevices', whole.format(e.totalDevices));
  for (const k of ['annualSales', 'monthlySales', 'annualFees', 'monthlyFees', 'perLocation', 'perDevice'] as const) {
    set(k, usd.format(e[k]));
  }
  const days = daysUntil(f.launchDate);
  set('daysToLaunch', days === null ? '–' : whole.format(days));
}

// ---------- Messages ----------
type Tone = 'ok' | 'err' | 'info';
const TONE_CLASSES: Record<Tone, string[]> = {
  ok: ['bg-green-50', 'text-green-800', 'border', 'border-green-200'],
  err: ['bg-red-50', 'text-red-800', 'border', 'border-red-200'],
  info: ['bg-stub', 'text-ink'],
};

function showStatus(text: string, tone: Tone): void {
  statusEl.classList.remove(...Object.values(TONE_CLASSES).flat(), 'hidden');
  statusEl.classList.add(...TONE_CLASSES[tone]);
  statusEl.textContent = text;
}

function hideStatus(): void {
  statusEl.classList.add('hidden');
  statusEl.textContent = '';
}

function markInvalid(): void {
  const f = readForm();
  for (const id of NUMERIC_FIELDS) {
    const v = f[id];
    field(id).setAttribute('aria-invalid', String(v.trim() === '' || !Number.isFinite(Number(v))));
  }
  field('clientName').setAttribute('aria-invalid', String(!f.clientName.trim()));
  field('launchDate').setAttribute('aria-invalid', String(!f.launchDate));
}

function clearInvalid(): void {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
}

const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

function showExisting(existing: ExistingEstimate[]): void {
  existingTitle.textContent =
    existing.length === 1
      ? `${existing[0].clientName} already has an estimate.`
      : `${existing[0].clientName} already has ${existing.length} or more estimates.`;
  existingList.replaceChildren(
    ...existing.map((x) => {
      const li = document.createElement('li');
      const when = Number.isNaN(Date.parse(x.enteredDate)) ? x.enteredDate : dateFmt.format(new Date(x.enteredDate));
      li.textContent = `Row ${x.row}, entered by ${x.enteredBy} on ${when}`;
      return li;
    }),
  );
  existingBox.classList.remove('hidden');
  confirmExistingBtn.focus();
}

function hideExisting(): void {
  existingBox.classList.add('hidden');
}

// ---------- Submit ----------
function setSaving(on: boolean): void {
  saving = on;
  saveBtn.disabled = on;
  confirmExistingBtn.disabled = on;
  clearBtn.disabled = on;
  saveBtn.textContent = on ? 'Saving…' : 'Save estimate';
}

async function save(allowExistingClient = false): Promise<void> {
  if (saving) return; // ignore double clicks and repeated Enter presses
  const input = { ...readForm(), allowExistingClient };
  const parsed = parseEstimate(input);
  if (!parsed.ok) {
    markInvalid();
    showStatus(parsed.errors.join(' '), 'err');
    return;
  }
  clearInvalid();
  hideStatus();
  setSaving(true);
  try {
    const res: SubmitResult = await callServer('submitEstimate', input);
    if (res.status === 'confirm-existing-client') {
      showExisting(res.existing);
      return;
    }
    hideExisting();
    resetForm();
    showStatus(
      res.alreadySaved
        ? `This estimate for ${res.clientName} was already saved in row ${res.row}. To change it, edit that row in the sheet.`
        : `Saved the estimate for ${res.clientName} in row ${res.row}.`,
      'ok',
    );
  } catch (err) {
    // submissionId is kept, so saving again after a timeout cannot add a second row.
    showStatus(`Estimate not saved. ${err instanceof Error ? err.message : String(err)}`, 'err');
  } finally {
    setSaving(false);
  }
}

function resetForm(): void {
  form.reset();
  submissionId = newId();
  clearInvalid();
  hideExisting();
  render();
}

// ---------- Wiring ----------
form.addEventListener('input', () => {
  render();
  hideExisting(); // a changed estimate needs to be checked again
  if (!statusEl.classList.contains('hidden') && !saving) hideStatus();
});
form.addEventListener('change', render);
form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  void save();
});
confirmExistingBtn.addEventListener('click', () => void save(true));
cancelExistingBtn.addEventListener('click', () => {
  hideExisting();
  showStatus('Estimate not saved. Change the details or clear the form.', 'info');
});
clearBtn.addEventListener('click', () => {
  resetForm();
  hideStatus();
});

render();
