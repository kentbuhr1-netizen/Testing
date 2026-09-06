# Outbreak — the store app

One app, one game. This folder wraps the web game in `games/outbreak` unchanged
in a [Capacitor](https://capacitorjs.com) shell, for the App Store and Google
Play. Nothing in the game changes; every file the browser gets, the app gets.

```bash
cd games/outbreak/app
npm install
npm run add:android      # once, on any machine
npm run add:ios          # once, on a Mac with Xcode
npm run sync             # every time the game changes: rebuild www/, then cap sync
npm run open:ios         # then archive and upload from Xcode
npm run open:android     # then build a signed bundle from Android Studio
```

## What the shell adds

- **Native save mirroring** (`native-storage.js`). iOS may evict WebView storage;
  every localStorage write is mirrored into Capacitor Preferences and restored on
  launch. A player never loses a campaign to the OS.
- **A build step** (`build.mjs`) that copies the game into `www/` and loads the
  shim ahead of the game. Nothing else is altered.

## Before you submit — the parts no script can do

- **App id:** `com.kentbuhr.outbreak`. Change it in `capacitor.config.json` before the first
  `cap add`; it cannot change after a store listing exists.
- **Payments.** The web paywall sells unlocks through Stripe. Both stores require
  their own in-app purchase for digital goods. Ship with `js/payments.config.js`
  blank (the complete game, no paywall — the default) or swap the licence check
  for StoreKit / Play Billing behind `js/payments/client/entitlements.js`.
- **The bonus shop** plays a timed stand-in for a rewarded ad and says so on
  screen. Stores reject placeholder functionality: wire a real rewarded ad behind
  `js/bonusshop/shell.js` (the hook is designed for AdMob) or hide the shop in
  store builds.
- **Store assets** are in `assets/` once `node tools/make-store-assets.mjs outbreak`
  has run from the repo root: a 1024×1024 icon and a splash. Screenshots still
  have to come from real devices.
- **Privacy policy and store listing** drafts are in `store/`. The policy needs a
  public URL; the listing needs a human read.
