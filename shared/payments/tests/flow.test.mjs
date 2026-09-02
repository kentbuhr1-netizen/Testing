/**
 * The whole purchase, end to end, with Stripe stubbed out.
 *
 * Nothing here talks to the network. What it does exercise is every place a
 * mistake would cost real money or give the game away for free: pricing,
 * webhook authenticity, replay, and what a licence ends up saying.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair } from '../server/licenses.mjs';
import { verifyLicence as verifyInBrowser } from '../client/licence.js';
import { PRODUCT_INDEX } from '../catalog.js';

const keys = generateKeyPair();
const WEBHOOK_SECRET = 'whsec_test_secret';
const dataDir = mkdtempSync(join(tmpdir(), 'flow-'));

process.env.PORT = '0';                       // let the OS pick, so tests never collide
process.env.STRIPE_SECRET_KEY = 'sk_test_stub';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.LICENCE_PRIVATE_KEY = keys.privateKeyPem;
process.env.LICENCE_PUBLIC_KEY = keys.publicKeySpkiB64;
process.env.SITE_URL = 'http://localhost:8081';
process.env.ALLOWED_ORIGINS = 'http://localhost:8081';
process.env.DATA_FILE = join(dataDir, 'purchases.json');

/* ---- Stripe, stubbed ------------------------------------------------ */

const stripeCalls = [];
const sessions = new Map();

globalThis.fetch = async (url, options = {}) => {
  stripeCalls.push({ url: String(url), body: options.body, headers: options.headers });
  const json = (status, payload) => ({
    ok: status < 400, status, json: async () => payload,
  });

  if (String(url).endsWith('/checkout/sessions') && options.method === 'POST') {
    const form = new URLSearchParams(options.body);
    const id = `cs_test_${sessions.size + 1}`;
    const session = {
      id,
      url: `https://checkout.stripe.com/pay/${id}`,
      payment_status: 'unpaid',
      client_reference_id: form.get('client_reference_id'),
      metadata: { product_id: form.get('metadata[product_id]') },
      customer_details: { email: null },
      amount_total: Number(form.get('line_items[0][price_data][unit_amount]')),
    };
    sessions.set(id, session);
    return json(200, session);
  }
  const match = String(url).match(/\/checkout\/sessions\/([^/?]+)$/);
  if (match) {
    const session = sessions.get(decodeURIComponent(match[1]));
    return session ? json(200, session) : json(404, { error: { message: 'No such session' } });
  }
  return json(404, { error: { message: 'unstubbed' } });
};

const { routes, server } = await import('../server/server.mjs');

before(() => {});
after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

/* ---- Calling the routes --------------------------------------------- */

function fakeRes() {
  const res = {
    statusCode: null, payload: null, headers: {}, headersSent: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers); this.headersSent = true; },
    end(body) { this.payload = body ? JSON.parse(body) : null; },
  };
  return res;
}

async function callRoute(method, path, { body = '', headers = {}, query = '' } = {}) {
  const handler = routes[`${method} ${path}`];
  assert.ok(handler, `no route ${method} ${path}`);
  const url = new URL(`http://localhost${path}${query}`);
  const req = { method, headers, url: url.pathname + url.search };
  const res = fakeRes();
  await handler(req, res, body, '127.0.0.1', url);
  return { status: res.statusCode, body: res.payload };
}

/** Sign a webhook body the way Stripe would. */
function signedWebhook(payload, secret = WEBHOOK_SECRET, at = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(`${at}.${raw}`).digest('hex');
  return { raw, header: `t=${at},v1=${signature}` };
}

const paidEvent = (session) => ({
  type: 'checkout.session.completed',
  data: { object: { ...session, payment_status: 'paid' } },
});

/* ---- Tests ----------------------------------------------------------- */

test('the game can fetch what it needs to draw a shop and verify offline', async () => {
  const { status, body } = await callRoute('GET', '/api/config');
  assert.equal(status, 200);
  assert.equal(body.publicKey, keys.publicKeySpkiB64);
  assert.ok(body.products.length > 0);
  // The public config must never leak anything secret.
  const serialised = JSON.stringify(body);
  assert.ok(!serialised.includes('PRIVATE KEY'));
  assert.ok(!serialised.includes('sk_test'));
  assert.ok(!serialised.includes(WEBHOOK_SECRET));
});

test('checkout is priced from the catalog, never from the browser', async () => {
  stripeCalls.length = 0;
  const { status, body } = await callRoute('POST', '/api/checkout', {
    body: JSON.stringify({
      productId: 'bundle.all',
      amount: 1,                                  // a tampered client trying it on
      successUrl: 'http://localhost:8081/games/outbreak/',
    }),
  });
  assert.equal(status, 200);
  assert.match(body.url, /^https:\/\/checkout\.stripe\.com\//);

  const form = new URLSearchParams(stripeCalls[0].body);
  assert.equal(Number(form.get('line_items[0][price_data][unit_amount]')),
    PRODUCT_INDEX['bundle.all'].amount);
  assert.equal(form.get('metadata[product_id]'), 'bundle.all');
  assert.match(stripeCalls[0].headers.Authorization, /^Bearer sk_test/);
});

test('checkout will only redirect back to an origin we allow', async () => {
  stripeCalls.length = 0;
  await callRoute('POST', '/api/checkout', {
    body: JSON.stringify({ productId: 'bundle.all', successUrl: 'https://evil.example.com/steal' }),
  });
  const form = new URLSearchParams(stripeCalls[0].body);
  assert.ok(!form.get('success_url').includes('evil.example.com'));
  assert.ok(form.get('success_url').startsWith('http://localhost:8081'));
});

test('a product that does not exist cannot be bought', async () => {
  const { status } = await callRoute('POST', '/api/checkout', {
    body: JSON.stringify({ productId: 'bundle.all.free.please' }),
  });
  assert.equal(status, 400);
});

test('an unsigned or wrongly signed webhook records nothing', async () => {
  const session = { id: 'cs_forged', metadata: { product_id: 'bundle.all' }, customer_details: { email: 'thief@example.com' } };

  const unsigned = await callRoute('POST', '/api/stripe/webhook', {
    body: JSON.stringify(paidEvent(session)),
  });
  assert.equal(unsigned.status, 400);

  const wrong = signedWebhook(paidEvent(session), 'whsec_the_wrong_secret');
  const forged = await callRoute('POST', '/api/stripe/webhook', {
    body: wrong.raw, headers: { 'stripe-signature': wrong.header },
  });
  assert.equal(forged.status, 400);

  // And nothing was written, so no licence can be had for it.
  const licence = await callRoute('GET', '/api/licence', { query: '?session_id=cs_forged' });
  assert.equal(licence.status, 402);
});

test('a stale webhook is refused even with a valid signature', async () => {
  const session = { id: 'cs_stale', metadata: { product_id: 'bundle.all' } };
  const old = signedWebhook(paidEvent(session), WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600);
  const { status } = await callRoute('POST', '/api/stripe/webhook', {
    body: old.raw, headers: { 'stripe-signature': old.header },
  });
  assert.equal(status, 400);
});

test('a session Stripe has not marked paid unlocks nothing', async () => {
  const session = { id: 'cs_unpaid', metadata: { product_id: 'bundle.all' } };
  sessions.set('cs_unpaid', { ...session, payment_status: 'unpaid' });
  const event = { type: 'checkout.session.completed', data: { object: { ...session, payment_status: 'unpaid' } } };
  const signed = signedWebhook(event);
  const { status } = await callRoute('POST', '/api/stripe/webhook', {
    body: signed.raw, headers: { 'stripe-signature': signed.header },
  });
  assert.equal(status, 200, 'we still acknowledge it, we just do not act on it');

  // And asking Stripe directly gives the same answer, not a licence.
  const licence = await callRoute('GET', '/api/licence', { query: '?session_id=cs_unpaid' });
  assert.equal(licence.status, 402);
});

test('a session id nobody ever created is a refusal, not an outage', async () => {
  const { status, body } = await callRoute('GET', '/api/licence', {
    query: '?session_id=cs_never_existed',
  });
  assert.equal(status, 402, 'a made-up session must not look like Stripe being down');
  assert.ok(!/reach/i.test(body.error || ''));
});

test('a paid webhook yields a licence the browser accepts, and a code that restores it', async () => {
  const session = {
    id: 'cs_paid_1',
    metadata: { product_id: 'outbreak.full' },
    customer_details: { email: 'buyer@example.com' },
  };
  const signed = signedWebhook(paidEvent(session));
  const hook = await callRoute('POST', '/api/stripe/webhook', {
    body: signed.raw, headers: { 'stripe-signature': signed.header },
  });
  assert.equal(hook.status, 200);

  const { status, body } = await callRoute('GET', '/api/licence', { query: '?session_id=cs_paid_1' });
  assert.equal(status, 200);
  assert.ok(body.code, 'a buyer needs a way back after a reinstall');

  const verified = await verifyInBrowser(body.licence, keys.publicKeySpkiB64);
  assert.equal(verified.ok, true, verified.why);
  assert.deepEqual(verified.licence.products, ['outbreak.full']);

  // The code brings the same licence back on a new device.
  const restored = await callRoute('POST', '/api/licence/redeem', {
    body: JSON.stringify({ code: body.code.toLowerCase() }),
  });
  assert.equal(restored.status, 200);
  const restoredLicence = await verifyInBrowser(restored.body.licence, keys.publicKeySpkiB64);
  assert.deepEqual(restoredLicence.licence.products, ['outbreak.full']);
});

test('a redelivered webhook does not mint a second code', async () => {
  const session = {
    id: 'cs_paid_1',
    metadata: { product_id: 'outbreak.full' },
    customer_details: { email: 'buyer@example.com' },
  };
  const first = await callRoute('GET', '/api/licence', { query: '?session_id=cs_paid_1' });
  const signed = signedWebhook(paidEvent(session));
  await callRoute('POST', '/api/stripe/webhook', {
    body: signed.raw, headers: { 'stripe-signature': signed.header },
  });
  const second = await callRoute('GET', '/api/licence', { query: '?session_id=cs_paid_1' });
  assert.equal(second.body.code, first.body.code);
});

test('a second purchase on the same email joins the first in one licence', async () => {
  const session = {
    id: 'cs_paid_2',
    metadata: { product_id: 'lemonade.full' },
    customer_details: { email: 'buyer@example.com' },
  };
  const signed = signedWebhook(paidEvent(session));
  await callRoute('POST', '/api/stripe/webhook', {
    body: signed.raw, headers: { 'stripe-signature': signed.header },
  });

  const { body } = await callRoute('GET', '/api/licence', { query: '?session_id=cs_paid_2' });
  const verified = await verifyInBrowser(body.licence, keys.publicKeySpkiB64);
  assert.deepEqual(verified.licence.products, ['lemonade.full', 'outbreak.full']);
});

test('coming back from Stripe works even if the webhook has not landed yet', async () => {
  // Nothing recorded for this session; the server should ask Stripe directly
  // rather than show someone who has just paid a locked game.
  sessions.set('cs_race', {
    id: 'cs_race',
    payment_status: 'paid',
    metadata: { product_id: 'bundle.all' },
    customer_details: { email: 'racer@example.com' },
  });
  const { status, body } = await callRoute('GET', '/api/licence', { query: '?session_id=cs_race' });
  assert.equal(status, 200);
  const verified = await verifyInBrowser(body.licence, keys.publicKeySpkiB64);
  assert.deepEqual(verified.licence.products, ['bundle.all']);
});

test('an unknown recovery code is refused', async () => {
  const { status } = await callRoute('POST', '/api/licence/redeem', {
    body: JSON.stringify({ code: 'AAAAA-AAAAA' }),
  });
  assert.equal(status, 404);
});
