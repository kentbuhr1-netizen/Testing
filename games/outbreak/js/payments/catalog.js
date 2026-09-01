/* Copied from shared/payments/catalog.js by tools/sync-payments.mjs — edit the shared copy, not this one. */
/**
 * What is for sale, and what each purchase unlocks.
 *
 * This file is the single source of truth, imported by both the browser and
 * the server. The browser uses it to draw the paywall; the server uses it to
 * price the checkout. Prices are only ever read from the server side of that
 * pair — the client never tells the server what something costs — so editing
 * this file in devtools changes nothing that matters.
 */

/** How much of each game is free. Everything past this needs an unlock. */
export const FREE_TIER = {
  outbreak: { regions: 3 },
  lemonade: { cities: 3 },
  'the-round': { towns: 3 },
};

/**
 * `id` is what ends up inside a signed licence, so never reuse or renumber
 * one: a licence issued last year still names the id it was sold under.
 */
export const PRODUCTS = [
  {
    id: 'outbreak.full',
    game: 'outbreak',
    name: 'Outbreak — full campaign',
    blurb: 'All 25 regions, all 625 districts, and the agency.',
    amount: 499,               // in the smallest currency unit
    currency: 'usd',
    unlocks: ['outbreak'],
  },
  {
    id: 'lemonade.full',
    game: 'lemonade',
    name: 'Lemonade Stand — full campaign',
    blurb: 'All 25 cities, all 625 corners, and the supply chain.',
    amount: 499,
    currency: 'usd',
    unlocks: ['lemonade'],
  },
  {
    id: 'the-round.full',
    game: 'the-round',
    name: 'The Round — full campaign',
    blurb: 'All 25 towns, all 625 rounds, and the yard.',
    amount: 499,
    currency: 'usd',
    unlocks: ['the-round'],
  },
  {
    id: 'bundle.all',
    game: null,
    name: 'Every game, forever',
    blurb: 'Every game in full, plus every game added later. One payment.',
    // Deliberately below the sum of the singles, and it stays there as games
    // are added — the bundle should always be the obvious buy, never a trap
    // for anyone who does the arithmetic at the point of sale.
    amount: 799,
    currency: 'usd',
    unlocks: ['*'],
    featured: true,
  },
];

export const PRODUCT_INDEX = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

/** Products that unlock a given game, cheapest first. */
export function productsFor(game) {
  return PRODUCTS
    .filter((p) => p.unlocks.includes(game) || p.unlocks.includes('*'))
    .sort((a, b) => a.amount - b.amount);
}

/**
 * Does this set of owned product ids unlock `game`?
 * `'*'` is the forever bundle and covers games that did not exist when it
 * was bought — which is the whole point of selling it.
 */
export function unlocks(ownedProductIds, game) {
  for (const id of ownedProductIds || []) {
    const product = PRODUCT_INDEX[id];
    if (!product) continue;                        // an id we have retired
    if (product.unlocks.includes('*')) return true;
    if (product.unlocks.includes(game)) return true;
  }
  return false;
}

export function formatPrice(product) {
  const major = (product.amount / 100).toFixed(2);
  const symbol = { usd: '$', gbp: '£', eur: '€' }[product.currency] || '';
  return symbol ? `${symbol}${major}` : `${major} ${product.currency.toUpperCase()}`;
}
