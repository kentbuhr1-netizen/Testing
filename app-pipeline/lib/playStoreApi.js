// Thin wrapper around the Google Play Developer API's reviews.list method.
// Docs: https://developers.google.com/android-publisher/api-ref/rest/v3/reviews/list
import { google } from 'googleapis';

function isConfigured() {
  return Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
}

function makeClient() {
  const credentials = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  return google.androidpublisher({ version: 'v3', auth });
}

// Fetches every review for an app. Returns the same normalized shape as
// appStoreApi.fetchReviews so storeMonitor can treat both platforms alike.
export async function fetchReviews(storeId) {
  if (!isConfigured()) {
    throw new Error('Google Play Developer API is not configured (set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)');
  }

  const androidpublisher = makeClient();
  const reviews = [];
  let pageToken;

  do {
    const { data } = await androidpublisher.reviews.list({
      packageName: storeId,
      token: pageToken,
      maxResults: 200,
    });
    for (const item of data.reviews || []) {
      const comment = item.comments?.[0]?.userComment;
      if (!comment) continue;
      reviews.push({
        externalId: item.reviewId,
        rating: comment.starRating,
        content: comment.text || '',
        createdAt: comment.lastModified
          ? new Date(Number(comment.lastModified.seconds) * 1000).toISOString()
          : null,
      });
    }
    pageToken = data.tokenPagination?.nextPageToken;
  } while (pageToken);

  return reviews;
}

export const _internal = { isConfigured, makeClient };
