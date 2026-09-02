#!/usr/bin/env node
/**
 * The payments server.
 *
 * Small on purpose. It does four things:
 *   1. starts a Stripe Checkout session, priced from the catalog, never from
 *      the browser;
 *   2. listens for Stripe's webhook and records what was actually paid for;
 *   3. hands a buyer a signed licence, plus a recovery code for reinstalls;
 *   4. exchanges that code for a licence later.
 *
 * The money lands in your Stripe account and is paid out to your bank on
 * Stripe's schedule. Nothing here ever touches a card number.
 *
 *   node server.mjs --keygen     # print a fresh licence key pair
 *   node server.mjs              # run it
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { PRODUCT_INDEX, PRODUCTS } from '../catalog.js';
import { generateKeyPair, issueLicence, recoveryCode } from './licenses.mjs';
import { createCheckoutSession, retrieveSession, verifyWebhookSignature } from './stripe.mjs';
import { createStore } from './store.mjs';

if (process.argv.includes('--keygen')) {
  const { privateKeyPem, publicKeySpkiB64 } = generateKeyPair();
  process.stdout.write(
    `# Put this in the server's environment, and never anywhere else:\n` +
    `LICENCE_PRIVATE_KEY="${privateKeyPem.trim().replace(/\n/g, '\\n')}"\n\n` +
    `# This half is safe to ship inside the games:\n` +
    `LICENCE_PUBLIC_KEY="${publicKeySpkiB64}"\n`
  );
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

const config = {
  port: Number(process.env.PORT || 8787),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  privateKeyPem: (process.env.LICENCE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  publicKeySpkiB64: process.env.LICENCE_PUBLIC_KEY,
  siteUrl: process.env.SITE_URL || 'http://localhost:8081',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:8080,http://localhost:8081')
    .split(',').map((s) => s.trim()).filter(Boolean),
  dataFile: process.env.DATA_FILE || new URL('./data/purchases.json', import.meta.url).pathname,
};

for (const [key, hint] of [
  ['stripeSecretKey', 'STRIPE_SECRET_KEY'],
  ['webhookSecret', 'STRIPE_WEBHOOK_SECRET'],
  ['privateKeyPem', 'LICENCE_PRIVATE_KEY (run --keygen)'],
  ['publicKeySpkiB64', 'LICENCE_PUBLIC_KEY (run --keygen)'],
]) {
  if (!config[key]) {
    console.error(`Missing ${hint}. See .env.example.`);
    process.exit(1);
  }
}

const store = createStore(config.dataFile);

/* ------------------------------------------------------------------ *
 * Plumbing
 * ------------------------------------------------------------------ */

const readBody = (req, limit = 1_000_000) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > limit) { reject(new Error('body too large')); req.destroy(); }
  });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const send = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

/** Crude but sufficient: stops someone hammering checkout or redeem. */
const hits = new Map();
function rateLimited(key, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const seen = (hits.get(key) || []).filter((t) => now - t < windowMs);
  seen.push(now);
  hits.set(key, seen);
  if (hits.size > 10_000) hits.clear();
  return seen.length > limit;
}

/** Everything this buyer owns, as one licence. */
function licenceFor(purchase) {
  const related = purchase.email ? store.byEmail(purchase.email) : [purchase];
  const products = [...new Set([purchase.productId, ...related.map((p) => p.productId)])]
    .filter((id) => PRODUCT_INDEX[id]);
  return issueLicence({
    subject: purchase.email || purchase.sessionId,
    products,
    privateKeyPem: config.privateKeyPem,
  });
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

const routes = {
  'GET /health': async (req, res) => send(res, 200, { ok: true, purchases: store.count() }),

  /** What the paywall needs to draw itself and verify licences offline. */
  'GET /api/config': async (req, res) => send(res, 200, {
    publicKey: config.publicKeySpkiB64,
    products: PRODUCTS.map(({ id, game, name, blurb, amount, currency, unlocks, featured }) =>
      ({ id, game, name, blurb, amount, currency, unlocks, featured })),
  }),

  'POST /api/checkout': async (req, res, body, ip) => {
    if (rateLimited(`checkout:${ip}`)) return send(res, 429, { error: 'Too many attempts.' });
    let parsed;
    try { parsed = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'Bad JSON.' }); }

    const product = PRODUCT_INDEX[parsed.productId];
    if (!product) return send(res, 400, { error: 'No such product.' });

    try {
      const session = await createCheckoutSession({
        secretKey: config.stripeSecretKey,
        product,
        successUrl: parsed.successUrl && config.allowedOrigins.some((o) => parsed.successUrl.startsWith(o))
          ? parsed.successUrl
          : config.siteUrl,
        cancelUrl: parsed.cancelUrl && config.allowedOrigins.some((o) => parsed.cancelUrl.startsWith(o))
          ? parsed.cancelUrl
          : config.siteUrl,
        email: parsed.email,
      });
      return send(res, 200, { url: session.url, sessionId: session.id });
    } catch (error) {
      console.error('checkout failed:', error.message);
      return send(res, 502, { error: 'Could not start checkout.' });
    }
  },

  /**
   * Stripe tells us what was paid for. This is the only thing that may create
   * a purchase — the browser is never believed about payment.
   */
  'POST /api/stripe/webhook': async (req, res, body) => {
    const result = verifyWebhookSignature({
      rawBody: body,
      header: req.headers['stripe-signature'],
      secret: config.webhookSecret,
    });
    if (!result.ok) {
      console.warn('rejected webhook:', result.why);
      return send(res, 400, { error: result.why });
    }

    const event = result.event;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data?.object || {};
      const productId = session.metadata?.product_id || session.client_reference_id;
      if (session.payment_status === 'paid' && PRODUCT_INDEX[productId]) {
        const purchase = store.record({
          sessionId: session.id,
          productId,
          email: session.customer_details?.email || session.customer_email || null,
          code: recoveryCode(randomBytes(10)),
        });
        console.log(`purchase ${purchase.productId} recorded for ${purchase.email || purchase.sessionId}`);
      }
    }
    return send(res, 200, { received: true });
  },

  /**
   * The buyer comes back from Stripe with a session id. The webhook may not
   * have landed yet, so fall back to asking Stripe directly rather than
   * showing someone who has just paid a locked game.
   */
  'GET /api/licence': async (req, res, body, ip, url) => {
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return send(res, 400, { error: 'No session.' });
    if (rateLimited(`licence:${ip}`)) return send(res, 429, { error: 'Too many attempts.' });

    let purchase = store.bySession(sessionId);
    if (!purchase) {
      try {
        const session = await retrieveSession({ secretKey: config.stripeSecretKey, sessionId });
        const productId = session.metadata?.product_id || session.client_reference_id;
        if (session.payment_status !== 'paid' || !PRODUCT_INDEX[productId]) {
          return send(res, 402, { error: 'That purchase is not complete.' });
        }
        purchase = store.record({
          sessionId: session.id,
          productId,
          email: session.customer_details?.email || session.customer_email || null,
          code: recoveryCode(randomBytes(10)),
        });
      } catch (error) {
        // A 4xx from Stripe means the session id is not real — that is the
        // caller's problem, not an outage, and answering 502 would send a
        // client into a retry loop over something that will never succeed.
        if (error.status >= 400 && error.status < 500) {
          return send(res, 402, { error: 'That purchase is not complete.' });
        }
        console.error('licence lookup failed:', error.message);
        return send(res, 502, { error: 'Could not reach Stripe.' });
      }
    }
    return send(res, 200, { licence: licenceFor(purchase), code: purchase.code });
  },

  /** Reinstalled, new phone, cleared storage: the code brings it all back. */
  'POST /api/licence/redeem': async (req, res, body, ip) => {
    if (rateLimited(`redeem:${ip}`, 10)) return send(res, 429, { error: 'Too many attempts.' });
    let parsed;
    try { parsed = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'Bad JSON.' }); }

    const purchase = store.byCode(parsed.code);
    if (!purchase) return send(res, 404, { error: 'We do not recognise that code.' });
    return send(res, 200, { licence: licenceFor(purchase), code: purchase.code });
  },
};

/* ------------------------------------------------------------------ *
 * Server
 * ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return send(res, 404, { error: 'Not found.' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress || 'unknown';

  try {
    const body = req.method === 'POST' ? await readBody(req) : '';
    await handler(req, res, body, ip, url);
  } catch (error) {
    console.error(`${req.method} ${url.pathname} failed:`, error.message);
    if (!res.headersSent) send(res, 500, { error: 'Something went wrong.' });
  }
});

server.listen(config.port, () => {
  console.log(`payments server on :${config.port}`);
  console.log(`origins allowed: ${config.allowedOrigins.join(', ')}`);
});

export { routes, config, licenceFor, server, store };
