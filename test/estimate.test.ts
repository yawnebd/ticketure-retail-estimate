import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcEstimates, clientKey, daysUntil, isValidSubmissionId, parseEstimate } from '../src/shared/estimate';

const valid = {
  submissionId: '3f2b1c9e-0d4a-4b7e-9a51-2c8f6e1d7a30',
  clientName: '  Denver   Zoo ',
  locations: '3',
  devicesPerLocation: '2',
  ccFee: '2.9',
  volumeBasis: 'Monthly' as const,
  salesVolume: '10000',
  launchDate: '2027-03-01',
  products: '120',
  retail: true,
  fnb: false,
  eventManagement: false,
};

test('parses valid input and normalises the client name', () => {
  const r = parseEstimate(valid);
  assert.ok(r.ok);
  assert.equal(r.data.clientName, 'Denver Zoo');
  assert.equal(r.data.feeRate, 0.029);
});

test('blank numbers are rejected rather than treated as 0', () => {
  const r = parseEstimate({ ...valid, salesVolume: '', products: ' ' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.length, 2);
});

test('fractional counts and missing business type are rejected', () => {
  const r = parseEstimate({ ...valid, locations: '2.5', devicesPerLocation: '-1', retail: false });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.length, 3);
});

test('Event Management alone is a valid business type', () => {
  const r = parseEstimate({ ...valid, retail: false, eventManagement: true });
  assert.ok(r.ok);
  assert.equal(r.data.eventManagement, true);
});

test('calculations match the sheet formulas', () => {
  const r = parseEstimate(valid);
  assert.ok(r.ok);
  const e = calcEstimates(r.data);
  assert.equal(e.totalDevices, 6);
  assert.equal(e.annualSales, 120000);
  assert.equal(e.monthlySales, 10000);
  assert.ok(Math.abs(e.annualFees - 3480) < 1e-9);
  assert.equal(e.perLocation, 40000);
  assert.equal(e.perDevice, 20000);
});

test('client names match regardless of case, spacing and punctuation', () => {
  assert.equal(clientKey('Denver Zoo, Inc.'), clientKey('denver  zoo inc'));
  assert.notEqual(clientKey('Denver Zoo'), clientKey('Denver Zoo Gift Shop'));
});

test('submission ids', () => {
  assert.ok(isValidSubmissionId(valid.submissionId));
  assert.ok(!isValidSubmissionId('short'));
  assert.ok(!isValidSubmissionId('<script>alert(1)</script>xxxxxx'));
});

test('days until launch', () => {
  assert.equal(daysUntil('2026-10-19', new Date(2026, 9, 9, 15, 30)), 10);
  assert.equal(daysUntil(''), null);
});
