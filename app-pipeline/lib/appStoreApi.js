// Thin wrapper around the App Store Connect API's customer reviews endpoint.
// Docs: https://developer.apple.com/documentation/appstoreconnectapi/list-all-customer-reviews-for-an-app
import jwt from 'jsonwebtoken';

const API_BASE = 'https://api.appstoreconnect.apple.com/v1';

function isConfigured() {
  return Boolean(
    process.env.APPSTORE_KEY_ID && process.env.APPSTORE_ISSUER_ID && process.env.APPSTORE_PRIVATE_KEY
  );
}

// App Store Connect tokens must be short-lived (Apple caps them at 20 minutes).
function makeToken() {
  const privateKey = process.env.APPSTORE_PRIVATE_KEY.replace(/\\n/g, '\n');
  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '19m',
    issuer: process.env.APPSTORE_ISSUER_ID,
    audience: 'appstoreconnect-v1',
    keyid: process.env.APPSTORE_KEY_ID,
  });
}

// Fetches every customer review for an app, newest first. Returns a
// normalized shape so storeMonitor doesn't need to know about App Store JSON.
export async function fetchReviews(storeId) {
  if (!isConfigured()) {
    throw new Error(
      'App Store Connect API is not configured (set APPSTORE_KEY_ID, APPSTORE_ISSUER_ID, APPSTORE_PRIVATE_KEY)'
    );
  }

  const token = makeToken();
  const reviews = [];
  let url = `${API_BASE}/apps/${storeId}/customerReviews?sort=-createdDate&limit=200`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`App Store Connect API error ${res.status}: ${await res.text()}`);
    }
    const body = await res.json();
    for (const item of body.data) {
      reviews.push({
        externalId: item.id,
        rating: item.attributes.rating,
        content: `${item.attributes.title || ''}\n${item.attributes.body || ''}`.trim(),
        createdAt: item.attributes.createdDate,
      });
    }
    url = body.links && body.links.next ? body.links.next : null;
  }

  return reviews;
}

export const _internal = { isConfigured, makeToken };
