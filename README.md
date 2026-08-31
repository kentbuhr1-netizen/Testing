# 🍋 Lemonade Stand

The classic lemonade stand game, built to be played on a phone. Thirty days,
twenty dollars, one corner. Read the forecast, buy supplies, mix the pitcher,
name your price, and try to end the season richer than you started.

It's a single static page — no build step, no framework, no accounts, no
network calls. Add it to your home screen and it runs offline.

## Play it on your phone

The game is plain HTML/CSS/JS, so any static host works (GitHub Pages,
Netlify, or a laptop on the same Wi-Fi).

```bash
npm start          # serves this folder on http://localhost:8080
```

Then open `http://<your-computer's-LAN-ip>:8080` on your phone. In the browser
menu choose **Add to Home Screen** to install it — it launches full screen and
keeps working with no signal.

> Modules are loaded with `<script type="module">`, so the page must be served
> over http(s). Opening `index.html` straight off the filesystem won't work.

## How it plays

Each day runs through four beats:

1. **Forecast** — the weather and any local news (a street fair, roadworks, a
   rival stand) set how many people will walk past.
2. **Supplies** — lemons, sugar, ice and cups, at prices that drift daily.
   Whatever ice you don't pour **melts overnight**; everything else keeps.
3. **The stand** — set the recipe (per 10-cup pitcher) and the price per cup.
4. **Open up** — customers walk by, and each one decides whether your lemonade
   is worth what you're asking.

Three things decide how you do:

- **Heat sells.** A scorcher brings crowds and loosens wallets. Rain empties
  the street.
- **Taste is a hidden target.** There's one balance of lemons and sugar people
  love, and the right amount of ice depends on the temperature. The game never
  shows you the target — customers just tell you when it's off ("too sour",
  "this is warm on a day like today").
- **Price is a trade.** Charge more and fewer people buy. Reputation grows when
  the lemonade was worth what you charged, and it's what brings the crowds back
  tomorrow. The last stretch to a perfect reputation is the hardest to earn.

Run out of cash with an empty cooler and the season ends early.

## Project layout

```
index.html              app shell
css/styles.css          all styling, light + dark
js/sim.js               the rules: weather, demand, pricing, reputation
js/app.js               screens, input, save file, day animation
tests/sim.test.mjs      rule tests (node's built-in runner)
tools/make-icons.mjs    regenerates icons/*.png from icons/icon.svg
sw.js                   offline cache
manifest.webmanifest    home-screen install metadata
```

`sim.js` is pure and has no DOM references — every rule can be exercised from
node, and the same seed always replays the same season.

```bash
npm test           # 17 rule tests
npm run icons      # rebuild PNG icons from the SVG (needs headless Chromium)
```

Progress saves to `localStorage` after every action, so closing the tab
mid-season is safe.
