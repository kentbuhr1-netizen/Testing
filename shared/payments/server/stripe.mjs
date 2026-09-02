/**
 * The thin slice of Stripe this needs, over plain fetch.
 *
 * No SDK on purpose: the games have no build step and no node_modules, and
 * the three calls involved are a form POST, a GET, and an HMAC comparison.
 * Nothing here ever runs in a browser — the secret key must not leave here.
 */
import crypto from 'node:crypto';

const API = 'https://api.stripe.com/v1';

/** Stripe takes form encoding with bracketed paths, not JSON. */
export function encodeForm(object, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null) continue;
    const path = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === 'object') encodeForm(item, `${path}[${i}]`, out);
        else out.append(`${path}[${i}]`, String(item));
      });
    } else if (value && typeof value === 'object') {
      encodeForm(value, path, out);
    } else {
      out.append(path, String(value));
    }
  }
  return out;
}

async function call(secretKey, method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? encodeForm(body).toString() : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.error?.message || `Stripe returned ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status, stripe: json?.error });
  }
  return json;
}

/**
 * A one-off payment for a single product.
 *
 * The price is built here from the catalog, never accepted from the browser,
 * so a tampered client cannot buy the bundle for a penny.
 */
export function createCheckoutSession({ secretKey, product, successUrl, cancelUrl, email }) {
  return call(secretKey, 'POST', '/checkout/sessions', {
    mode: 'payment',
    success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    customer_email: email || undefined,
    client_reference_id: product.id,
    metadata: { product_id: product.id },
    payment_intent_data: { metadata: { product_id: product.id } },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: product.currency,
        unit_amount: product.amount,
        product_data: { name: product.name, description: product.blurb },
      },
    }],
  });
}

export function retrieveSession({ secretKey, sessionId }) {
  return call(secretKey, 'GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

/**
 * Verify a webhook actually came from Stripe.
 *
 * Without this anyone who finds the endpoint can post themselves a licence,
 * so it is the one piece here that must not be skipped or loosened.
 */
export function verifyWebhookSignature({ rawBody, header, secret, toleranceSeconds = 300, now = Date.now() }) {
  if (!header || !secret) return { ok: false, why: 'missing signature or secret' };

  const parts = Object.fromEntries(
    header.split(',').map((piece) => {
      const at = piece.indexOf('=');
      return at < 0 ? ['', ''] : [piece.slice(0, at).trim(), piece.slice(at + 1).trim()];
    })
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return { ok: false, why: 'no timestamp' };
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return { ok: false, why: 'timestamp outside tolerance' };

  // A signature header can carry several v1 values during a secret rotation.
  const offered = header.split(',')
    .map((piece) => piece.split('='))
    .filter(([scheme]) => scheme.trim() === 'v1')
    .map(([, value]) => value.trim());
  if (offered.length === 0) return { ok: false, why: 'no v1 signature' };

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest();

  const matched = offered.some((candidate) => {
    let given;
    try { given = Buffer.from(candidate, 'hex'); } catch { return false; }
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!matched) return { ok: false, why: 'signature mismatch' };

  try {
    return { ok: true, event: JSON.parse(rawBody) };
  } catch {
    return { ok: false, why: 'body is not JSON' };
  }
}
