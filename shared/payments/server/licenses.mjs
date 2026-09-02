/**
 * Signed licences.
 *
 * A licence is a small JSON payload saying which products a buyer owns,
 * signed with an ECDSA P-256 key that only the server has. The browser holds
 * the public half and can verify a licence with no network at all, which is
 * what lets a paid game keep working on a plane.
 *
 * P-256 rather than Ed25519 because every browser's WebCrypto has had it for
 * a decade, and `ieee-p1363` because that is the raw r‖s signature encoding
 * WebCrypto expects — node's default DER encoding will not verify there.
 */
import crypto from 'node:crypto';

const SIG_ENCODING = { dsaEncoding: 'ieee-p1363' };
const DEFAULT_TTL_DAYS = 3650;   // a one-off purchase should outlive the laptop

export const b64url = {
  encode: (buf) => Buffer.from(buf).toString('base64url'),
  decode: (str) => Buffer.from(str, 'base64url'),
};

/** Generate a signing key pair. Run once; keep the private half secret. */
export function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeySpkiB64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

/**
 * Issue a licence.
 *
 * `subject` is whatever identifies the buyer to you — an email, or the opaque
 * id of a Stripe checkout session. It is echoed back in the licence so a
 * buyer can prove which licence is theirs, and never used as a secret.
 */
export function issueLicence({ subject, products, privateKeyPem, ttlDays = DEFAULT_TTL_DAYS, issuedAt = Date.now() }) {
  if (!subject) throw new Error('a licence needs a subject');
  if (!Array.isArray(products) || products.length === 0) throw new Error('a licence needs products');

  const payload = {
    v: 1,
    sub: String(subject),
    products: [...new Set(products)].sort(),
    iat: Math.floor(issuedAt / 1000),
    exp: Math.floor(issuedAt / 1000) + ttlDays * 86_400,
  };
  const body = b64url.encode(JSON.stringify(payload));
  const signature = crypto.sign('sha256', Buffer.from(body), {
    key: crypto.createPrivateKey(privateKeyPem),
    ...SIG_ENCODING,
  });
  return `${body}.${b64url.encode(signature)}`;
}

/**
 * Verify a licence server-side. The browser does the same check with
 * WebCrypto; this exists so the server can validate one it is handed back,
 * and so the tests can prove both halves agree.
 */
export function verifyLicence(token, publicKeySpkiB64, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false, why: 'malformed' };
  const [body, signature] = token.split('.');
  if (!body || !signature) return { ok: false, why: 'malformed' };

  let valid = false;
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeySpkiB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    valid = crypto.verify('sha256', Buffer.from(body), { key: publicKey, ...SIG_ENCODING },
      b64url.decode(signature));
  } catch {
    return { ok: false, why: 'malformed' };
  }
  if (!valid) return { ok: false, why: 'bad signature' };

  let payload;
  try {
    payload = JSON.parse(b64url.decode(body).toString('utf8'));
  } catch {
    return { ok: false, why: 'malformed' };
  }
  if (payload.v !== 1) return { ok: false, why: 'unknown version' };
  if (payload.exp * 1000 < now) return { ok: false, why: 'expired' };

  return { ok: true, licence: payload };
}

/** A short, human-typeable recovery code. Not a secret — it names a purchase. */
export function recoveryCode(random = crypto.randomBytes(10)) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';  // no 0/O/1/I
  let out = '';
  for (const byte of random) out += alphabet[byte % alphabet.length];
  return out.match(/.{1,5}/g).join('-');
}
