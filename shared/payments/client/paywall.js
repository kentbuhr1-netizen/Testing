/**
 * The shop screen, shared by every game.
 *
 * Renders to the same `{ body, actions }` shape the games' routers already
 * use, and reads its styling from whatever stylesheet the host game ships, so
 * it looks native in both without either game knowing anything about Stripe.
 */
import { PRODUCTS, productsFor, formatPrice } from '../catalog.js';
import * as Entitlements from './entitlements.js';

/** Transient screen state — a pending purchase, a message to show. */
const view = { busy: false, message: null, redeeming: false };

export function paywallScreen({ game, gameName }) {
  const owned = Entitlements.owns(game);
  const offers = game ? productsFor(game) : PRODUCTS;
  const free = Entitlements.freeTier(game);
  const freeCount = free.regions ?? free.cities ?? 0;
  const noun = free.regions != null ? 'regions' : 'cities';

  const cards = offers.map((product) => `
    <div class="card">
      <div class="row">
        <div class="row-main">
          <div class="row-name">${product.name}${product.featured ? ' ★' : ''}</div>
          <div class="row-sub">${product.blurb}</div>
        </div>
        <button class="chip" data-act="buyProduct" data-product="${product.id}"
                ${view.busy ? 'disabled' : ''}>${formatPrice(product)}</button>
      </div>
    </div>`).join('');

  return {
    body: `
      <h1 class="title">${owned ? 'Thank you' : 'Unlock the full campaign'}</h1>
      <p class="sub">${owned
        ? `${gameName} is unlocked on this device.`
        : `The first ${freeCount} ${noun} are free and always will be.`}</p>

      ${view.message ? `<div class="notice">${view.message}</div>` : ''}

      ${owned ? `
        <section class="card">
          <p>Everything is unlocked. Your recovery code is below — keep it
          somewhere safe and you can restore this on any device, forever.</p>
          ${Entitlements.recoveryCode()
            ? `<div class="row"><div class="row-main"><div class="row-name">Recovery code</div></div>
                 <div class="row-value">${Entitlements.recoveryCode()}</div></div>`
            : ''}
        </section>
      ` : !Entitlements.configured() ? `
        <section class="card">
          <p>Purchases are not switched on in this build. Everything past the
          free ${noun} is unavailable until the shop is configured.</p>
          <p class="muted small">Set <code>apiBase</code> and <code>publicKey</code>
          in <code>js/payments.config.js</code>.</p>
        </section>
      ` : `
        ${cards}
        <section class="card">
          <h2 class="card-title">Already bought it?</h2>
          <p class="muted small">Paste the recovery code you were given after paying.
          It works on every device, and does not expire.</p>
          <div class="row">
            <div class="row-main">
              <input id="redeem-code" class="text-input" placeholder="XXXXX-XXXXX"
                     autocapitalize="characters" autocomplete="off" spellcheck="false" />
            </div>
            <button class="chip" data-act="redeemCode" ${view.redeeming ? 'disabled' : ''}>Restore</button>
          </div>
        </section>
        <section class="card">
          <p class="muted small">Payment is handled by Stripe — no card details ever
          reach this game. One payment, no subscription, no adverts, and your
          progress is yours whether you buy anything or not.</p>
        </section>
      `}
    `,
    actions: `<button class="btn" data-act="closeShop">Back</button>`,
  };
}

/**
 * Handlers for the host game's action map. `rerender` is whatever the game
 * calls to redraw; `close` returns to wherever the shop was opened from.
 */
export function paywallActions({ rerender, close }) {
  return {
    closeShop() {
      view.message = null;
      close();
    },

    async buyProduct(el) {
      if (view.busy) return;
      view.busy = true;
      view.message = 'Opening checkout…';
      rerender();
      const result = await Entitlements.buy(el.dataset.product);
      view.busy = false;
      if (!result.ok) view.message = result.why;
      else view.message = null;
      rerender();
    },

    async redeemCode() {
      const input = document.getElementById('redeem-code');
      const code = input ? input.value : '';
      if (!code.trim()) { view.message = 'Enter the code you were given.'; return rerender(); }

      view.redeeming = true;
      view.message = 'Checking…';
      rerender();
      const result = await Entitlements.redeem(code);
      view.redeeming = false;
      view.message = result.ok ? 'Restored. Everything is unlocked.' : result.why;
      rerender();
    },
  };
}

/** Cleared when the shop is left, so a stale message never reappears. */
export function resetPaywall() {
  view.busy = false;
  view.redeeming = false;
  view.message = null;
}
