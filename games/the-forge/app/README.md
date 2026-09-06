# The Forge — the store app

One app, one game. This folder wraps the web game in `games/the-forge` unchanged
in a [Capacitor](https://capacitorjs.com) shell, for the App Store and Google
Play. Nothing in the game changes; every file the browser gets, the app gets.

```bash
cd games/the-forge/app
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

- **App id:** `com.kentbuhr.theforge`. Change it in `capacitor.config.json` before the first
  `cap add`; it cannot change after a store listing exists.
- **Payments.** The web paywall sells unlocks through Stripe. Both stores require
  their own in-app purchase for digital goods. Ship with `js/payments.config.js`
  blank (the complete game, no paywall — the default) or swap the licence check
  for StoreKit / Play Billing behind `js/payments/client/entitlements.js`.
- **The bonus shop** plays a timed stand-in for a rewarded ad and says so on
  screen. Stores reject placeholder functionality: wire a real rewarded ad behind
  `js/bonusshop/shell.js` (the hook is designed for AdMob) or hide the shop in
  store builds.
- **Store assets** are in `assets/` once `node tools/make-store-assets.mjs the-forge`
  has run from the repo root: a 1024×1024 icon and a splash. Screenshots still
  have to come from real devices.
- **Privacy policy and store listing** drafts are in `store/`. The policy needs a
  public URL; the listing needs a human read.

## Submission checklist

What is done in this repository, and what can only be done by a person with an
Apple Developer account and a Mac:

**Done here**

- [x] The game itself: 625 commissions, the guild, the bonus shop, 66 tests.
- [x] Capacitor shell, iOS/Android config, `webDir: www`, portrait, an app id.
- [x] Native save mirroring, so iOS evicting WebView storage cannot wipe a campaign.
- [x] `assets/icon-1024.png` (square, no alpha — App Store requires both) and
      `assets/splash-2732.png`, generated from the game's own `icons/icon.svg`.
- [x] A privacy policy in `store/privacy-policy.md` that is true of this build:
      no network requests, no analytics, no accounts, nothing collected.
- [x] Store listing copy in `store/listing.md`, ready to paste.
- [x] Offline-first: the whole game is cached by its own service worker, and
      nothing it loads comes from a network.

**Needs a person**

- [ ] `npm install && npm run add:ios` on a Mac with Xcode, then archive and
      upload. (`add:ios` cannot run on Linux, so it has not been run here.)
- [ ] **The bonus shop's ad is a placeholder** and says so on screen. Guideline
      2.1 rejects placeholder functionality: either wire a real rewarded ad into
      `js/bonusshop/shell.js` before submitting, or hide the shop in the store
      build. This is the one thing in this build a reviewer will fail it for.
- [ ] Screenshots from a real device — see `store/listing.md` for which five.
- [ ] A public URL for the privacy policy, and an email address in it.
- [ ] Signing: a bundle id registered to your team, a distribution certificate
      and a provisioning profile. Change `appId` before the first `cap add` if
      `com.kentbuhr.theforge` is not yours — it is fixed forever once a listing
      exists.
- [ ] The App Store Connect data-collection questionnaire: answer "None" to
      every category. That is accurate for this build, and stops being accurate
      the moment an ad SDK goes in.
