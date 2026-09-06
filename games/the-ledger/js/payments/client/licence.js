/* Copied from shared/payments/client/licence.js by tools/sync-payments.mjs — edit the shared copy, not this one. */
/**
 * Verifying a signed licence in the browser, with no network.
 *
 * The server signs with ECDSA P-256; the games ship only the public half, so
 * a licence can be checked on a plane and cannot be minted without the key
 * that never leaves the server.
 *
 * This is not DRM and does not pretend to be. Anyone willing to edit the
 * game's JavaScript can unlock it, exactly as with every offline game ever
 * shipped. What signing buys is that a licence cannot be *forged* — no
 * pasted string, shared file or edited save unlocks anything — so the honest
 * path stays simple and the dishonest one stays manual.
 */

const b64urlToBytes = (value) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const base64ToBytes = (value) => b64urlToBytes(value.replace(/\+/g, '-').replace(/\//g, '_'));

let cachedKey = null;
let cachedKeyMaterial = null;

async function importPublicKey(spkiBase64) {
  if (cachedKey && cachedKeyMaterial === spkiBase64) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    'spki',
    base64ToBytes(spkiBase64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  cachedKeyMaterial = spkiBase64;
  return cachedKey;
}

/**
 * Check a licence and return its payload.
 * Returns `{ ok: false, why }` for anything that does not verify — a caller
 * should treat every failure identically and simply stay locked.
 */
export async function verifyLicence(token, publicKeySpkiB64, now = Date.now()) {
  if (typeof token !== 'string' || !publicKeySpkiB64) return { ok: false, why: 'missing' };
  const [body, signature] = token.split('.');
  if (!body || !signature) return { ok: false, why: 'malformed' };

  let valid = false;
  try {
    const key = await importPublicKey(publicKeySpkiB64);
    valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      b64urlToBytes(signature),
      new TextEncoder().encode(body)
    );
  } catch {
    return { ok: false, why: 'malformed' };
  }
  if (!valid) return { ok: false, why: 'bad signature' };

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
  } catch {
    return { ok: false, why: 'malformed' };
  }
  if (payload.v !== 1) return { ok: false, why: 'unknown version' };
  if (payload.exp * 1000 < now) return { ok: false, why: 'expired' };

  return { ok: true, licence: payload };
}
