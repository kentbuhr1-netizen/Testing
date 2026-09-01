import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, issueLicence, verifyLicence, recoveryCode } from '../server/licenses.mjs';
import { verifyLicence as verifyInBrowser } from '../client/licence.js';

const keys = generateKeyPair();

const licence = (overrides = {}) => issueLicence({
  subject: 'buyer@example.com',
  products: ['bundle.all'],
  privateKeyPem: keys.privateKeyPem,
  ...overrides,
});

test('a licence the server signs is one the browser accepts', async () => {
  // This is the load-bearing one: node signs with ieee-p1363 precisely so
  // WebCrypto can verify it, and nothing else in the stack checks that.
  const token = licence();
  const inBrowser = await verifyInBrowser(token, keys.publicKeySpkiB64);
  assert.equal(inBrowser.ok, true, inBrowser.why);
  assert.deepEqual(inBrowser.licence.products, ['bundle.all']);
  assert.equal(inBrowser.licence.sub, 'buyer@example.com');
});

test('a tampered licence verifies nowhere', async () => {
  const token = licence();
  const [body, signature] = token.split('.');

  // Claim the bundle instead of what was bought, keeping the old signature.
  const forgedBody = Buffer.from(JSON.stringify({
    v: 1, sub: 'thief@example.com', products: ['bundle.all'],
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 999,
  })).toString('base64url');
  const forged = `${forgedBody}.${signature}`;

  assert.equal(verifyLicence(forged, keys.publicKeySpkiB64).ok, false);
  assert.equal((await verifyInBrowser(forged, keys.publicKeySpkiB64)).ok, false);

  // A flipped signature byte fails too.
  const flipped = `${body}.${signature.slice(0, -2)}${signature.slice(-2) === 'AA' ? 'AB' : 'AA'}`;
  assert.equal(verifyLicence(flipped, keys.publicKeySpkiB64).ok, false);
});

test('a licence signed by somebody else is worthless', async () => {
  const attacker = generateKeyPair();
  const token = issueLicence({
    subject: 'thief', products: ['bundle.all'], privateKeyPem: attacker.privateKeyPem,
  });
  assert.equal(verifyLicence(token, keys.publicKeySpkiB64).ok, false);
  assert.equal((await verifyInBrowser(token, keys.publicKeySpkiB64)).ok, false);
});

test('an expired licence is refused by both halves', async () => {
  const old = licence({ issuedAt: Date.now() - 400 * 86_400_000, ttlDays: 30 });
  assert.equal(verifyLicence(old, keys.publicKeySpkiB64).why, 'expired');
  assert.equal((await verifyInBrowser(old, keys.publicKeySpkiB64)).why, 'expired');
});

test('rubbish in is a clean refusal, not a crash', async () => {
  for (const bad of ['', 'nonsense', 'a.b', '....', 'eyJhIjoxfQ']) {
    assert.equal(verifyLicence(bad, keys.publicKeySpkiB64).ok, false, bad);
    assert.equal((await verifyInBrowser(bad, keys.publicKeySpkiB64)).ok, false, bad);
  }
  assert.equal(verifyLicence(null, keys.publicKeySpkiB64).ok, false);
  assert.equal((await verifyInBrowser(undefined, keys.publicKeySpkiB64)).ok, false);
});

test('a licence refuses to be issued without a subject or products', () => {
  assert.throws(() => issueLicence({ products: ['bundle.all'], privateKeyPem: keys.privateKeyPem }));
  assert.throws(() => issueLicence({ subject: 'x', products: [], privateKeyPem: keys.privateKeyPem }));
});

test('recovery codes are readable and unlikely to collide', () => {
  const codes = new Set();
  for (let i = 0; i < 500; i++) codes.add(recoveryCode());
  assert.equal(codes.size, 500);
  const one = recoveryCode();
  assert.match(one, /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
  assert.ok(!/[01OI]/.test(one), 'ambiguous characters should be excluded');
});
