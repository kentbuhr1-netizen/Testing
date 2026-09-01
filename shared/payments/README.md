# Payments

Real money, into your Stripe account, for unlocks bought inside the games.

One payments server serves every game. Each game ships a copy of the browser
half (kept in step by `tools/sync-payments.mjs`) and a `payments.config.js`
saying where the server is.

---

## The one thing to understand first

**A static game cannot take money on its own.** A secret key can never live in
a browser, and an unlock the browser alone decides is forgeable by anyone who
opens devtools. So there are two halves:

| | Runs where | Holds |
|---|---|---|
| **The games** | The player's phone | The *public* licence key. Nothing secret. |
| **The server** | A host you control | The Stripe secret key, the webhook secret, the *private* licence key. |

The server is the only thing that may decide somebody has paid, and the only
thing Stripe ever talks to about money.

### What this does and does not stop

Purchases are proved with a **signed licence**: a short token saying which
products a buyer owns, signed with a key only your server has. The game
verifies it with WebCrypto and no network, which is what lets a paid game keep
working offline.

That means **a licence cannot be forged, shared or invented** — no pasted
string, edited save or copied file unlocks anything, and the test suite proves
it. It does **not** mean the game cannot be unlocked by someone who edits its
JavaScript. Nothing client-side can stop that, and no offline game has ever
managed it. The aim is to make paying the easy path, not to fight the small
number of people who would rather patch a file than spend $4.99.

---

## Setting it up

### 1. A Stripe account

Sign up at [stripe.com](https://stripe.com) and complete activation — business
details and a bank account. **This is the step that makes money actually reach
you**; without it you can only take test payments. Stripe pays out to that
account on a rolling schedule (usually every couple of days once established).

Stripe's fee on a card payment is roughly **2.9% + 30¢** in the US, which on a
$4.99 unlock is about 44¢. Check current rates for your country.

### 2. Licence signing keys

```bash
cd shared/payments/server
npm run keygen
```

It prints two values. `LICENCE_PRIVATE_KEY` goes in the server's environment
and **nowhere else, ever**. `LICENCE_PUBLIC_KEY` is meant to be public and goes
inside the games.

Losing the private key means every licence you have ever issued stops
verifying. Back it up somewhere you would back up a password.

### 3. Configure and run the server

```bash
cp .env.example .env      # then fill it in
npm start
```

| Variable | Where it comes from |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys. The **secret** key. Start with `sk_test_…`. |
| `STRIPE_WEBHOOK_SECRET` | Created in step 4. |
| `LICENCE_PRIVATE_KEY` | `npm run keygen`. |
| `LICENCE_PUBLIC_KEY` | `npm run keygen`. |
| `SITE_URL` | Where the games are served. |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to call the API and to be redirected back to. |

Deploy it anywhere that runs Node 20+ and gives you a stable HTTPS URL — Fly,
Render, Railway, a VPS behind Caddy. It needs no database; purchases go in a
JSON file (`DATA_FILE`) on a persistent disk. **Put that file on a volume that
survives redeploys**, or buyers lose their recovery codes.

### 4. The webhook

In the Stripe dashboard → Developers → Webhooks → *Add endpoint*:

- **URL**: `https://your-server/api/stripe/webhook`
- **Events**: `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`

Copy the signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` and restart.

This webhook is the only thing that creates a purchase. Its signature check is
the single most important line in the system: without it, anyone who finds the
URL can post themselves a free licence.

### 5. Point the games at it

Edit each game's `js/payments.config.js`:

```js
export const PAYMENTS = {
  apiBase: 'https://your-server',
  publicKey: 'MFkwEwYHKoZIzj0CAQ…',   // LICENCE_PUBLIC_KEY
  game: 'outbreak',
  gameName: 'Outbreak',
};
```

Then re-sync the shared client and deploy the games:

```bash
node tools/sync-payments.mjs
```

**Leaving `apiBase` and `publicKey` blank turns the paywall off entirely and
the game is the complete game.** That is deliberate: it keeps the repository
worth cloning, and it means a broken config can never lock out a paying
player. Gating exists only on the copy you host with real values.

### 6. Take a test payment

With `sk_test_…` in place, buy something in the game using Stripe's test card:

```
4242 4242 4242 4242 · any future expiry · any CVC · any postcode
```

You should come back to the game unlocked, with a recovery code. Check
`stripe listen --forward-to localhost:8787/api/stripe/webhook` if you are
testing locally, since Stripe cannot reach your laptop otherwise.

### 7. Go live

Swap `sk_test_…` for `sk_live_…`, create a **live-mode** webhook endpoint (test
and live have separate secrets), and update `STRIPE_WEBHOOK_SECRET`.

---

## What is sold

Edit `catalog.js` — it is the single source of truth for both halves.

```js
{ id: 'outbreak.full', game: 'outbreak', amount: 499, currency: 'usd',
  unlocks: ['outbreak'] }
```

The price is only ever read **server-side** when creating the checkout, so a
tampered browser cannot buy the bundle for a penny. A test asserts that.

`unlocks: ['*']` is the forever bundle: it covers games that did not exist when
it was bought, which is what makes it worth selling alongside a weekly game
series. Keep it priced below the sum of the singles — there is a test for that
too.

**Never reuse or renumber a product `id`.** A licence issued last year still
names the id it was sold under.

`FREE_TIER` says how much of each game is playable without paying. Everything
before it stays free forever, which is the honest version of a demo.

---

## Buyers who reinstall

Every purchase gets a **recovery code** (`H4K9P-2VNQX`). Pasting it into any
copy of the game restores everything that email has ever bought. It is not a
secret and not a password — it names a purchase, and the server does the
deciding. Rate-limited to 10 attempts a minute per address.

If a buyer used the same email twice, one licence carries both purchases.

---

## App stores

This is for the **web**. If you ever wrap these in a native shell and put them
on the App Store or Play Store, both require you to use *their* in-app
purchase system for digital goods and take **15–30%**, and linking out to
Stripe from inside the app will get the build rejected in most jurisdictions.
Shipping as an installable web app — which is what these already are — keeps
the 97%.

---

## Running the tests

```bash
cd shared/payments/server && npm test
```

33 tests, no network. They cover the things that would cost real money if they
were wrong: pricing from the catalog rather than the browser, webhook
authenticity and replay, licences that verify in WebCrypto exactly as signed,
forged and expired licences, and a buyer who reinstalls.
