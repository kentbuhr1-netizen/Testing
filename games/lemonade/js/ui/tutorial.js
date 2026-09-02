/**
 * A short, skippable welcome sequence shown once to a first-time player.
 * Reachable again anytime from the title screen.
 */
import { store, markTutorialSeen } from '../store.js';

const SLIDES = [
  {
    icon: '🍋',
    title: 'Welcome to the corner',
    body: 'You start with a few dollars and one street corner. Read the weather, mix a pitcher, name your price, and see who stops by.',
  },
  {
    icon: '🌡️',
    title: 'Heat brings customers',
    body: 'A scorcher fills the street and loosens wallets. Rain empties it. Check the forecast every morning before you shop.',
  },
  {
    icon: '🤫',
    title: 'The recipe is a secret',
    body: 'One balance of lemons, sugar and ice wins people over — the game never shows you which. Customers tell you when it is off: too sour, not sweet enough, warm on a hot day. Adjust and listen.',
  },
  {
    icon: '💲',
    title: 'Price is a trade-off',
    body: 'Charge more and fewer people buy. Reputation grows when the lemonade was worth what you charged, and a strong reputation brings the crowds back tomorrow.',
  },
  {
    icon: '🗺️',
    title: 'One corner, then the world',
    body: 'Every corner sets a profit target. Clear it and the next one opens. Take every corner in a city to claim it — and once you have taken five cities, you can start running the whole operation from the top.',
  },
];

function tutorialScreen() {
  const i = store.ui.tutorialStep || 0;
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;
  const dots = SLIDES.map((_, idx) => `<span class="tut-dot ${idx === i ? 'on' : ''}"></span>`).join('');

  return {
    body: `
      <div class="tut-slide">
        <div class="tut-icon">${slide.icon}</div>
        <h1>${slide.title}</h1>
        <p>${slide.body}</p>
      </div>
      <div class="tut-dots">${dots}</div>`,
    actions: `
      <button class="btn" data-act="tutorial-next">${last ? "Let's Go" : 'Next'}</button>
      ${last ? '' : '<button class="btn-ghost" data-act="tutorial-skip">Skip</button>'}`,
  };
}

export const screens = { tutorial: tutorialScreen };

export const actions = {
  'start-tutorial': () => {
    store.ui.tutorialStep = 0;
    store.ui.showTutorial = true;
  },
  'tutorial-next': () => {
    if ((store.ui.tutorialStep || 0) >= SLIDES.length - 1) {
      markTutorialSeen();
      store.ui.showTutorial = false;
    } else {
      store.ui.tutorialStep = (store.ui.tutorialStep || 0) + 1;
    }
  },
  'tutorial-skip': () => {
    markTutorialSeen();
    store.ui.showTutorial = false;
  },
};
