/** The achievements list — a record of what you've actually done, nothing to buy. */
import { store, loadUnlockedAchievements } from '../store.js';
import { ACHIEVEMENTS } from '../achievements.js';

function achievementsScreen() {
  const unlocked = loadUnlockedAchievements();
  const total = Object.keys(ACHIEVEMENTS).length;
  const got = Object.keys(unlocked).length;

  const rows = Object.entries(ACHIEVEMENTS).map(([id, a]) => {
    const earned = unlocked[id];
    return `<div class="row ${earned ? '' : 'locked'}">
        <div class="row-main">
          <div class="row-name">${earned ? a.icon : '🔒'} ${a.title}</div>
          <div class="row-sub">${a.desc}</div>
        </div>
        ${earned ? '<span class="chip chip-on">✓</span>' : ''}
      </div>`;
  }).join('');

  return {
    body: `
      <h1>Achievements</h1>
      <p class="muted">${got} of ${total} unlocked.</p>
      <div class="card">${rows}</div>`,
    actions: `<button class="btn" data-act="close-achievements">Back</button>`,
  };
}

export const screens = { achievements: achievementsScreen };

export const actions = {
  'open-achievements': () => { store.ui.showAchievements = true; },
  'close-achievements': () => { store.ui.showAchievements = false; },
};
