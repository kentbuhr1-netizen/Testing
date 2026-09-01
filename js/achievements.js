/**
 * Achievements — a catalog of concrete, checkable accomplishments, plus the
 * pure logic that decides which ones just became true.
 *
 * No storage here. store.js persists which ids are unlocked and gathers the
 * numbers below from live game state; this file only knows the rules, so it
 * can be tested the same way as everything else in this codebase.
 */

export const ACHIEVEMENTS = {
  firstCup:      { icon: '🍋', title: 'First Cup',        desc: 'Sell your very first cup of lemonade.' },
  soldOut:       { icon: '🎉', title: 'Sold Out',         desc: 'Sell out of stock before the day is over.' },
  perfectPour:   { icon: '✨', title: 'Perfect Pour',      desc: 'Pour a recipe at 98%+ quality.' },
  centuryDay:    { icon: '💯', title: 'Century Day',      desc: 'Sell 100 cups in a single day.' },
  firstCorner:   { icon: '🏅', title: 'Staked a Claim',   desc: 'Claim your first street corner.' },
  homeTown:      { icon: '🏙️', title: 'Home Town Hero',   desc: 'Take an entire city — all of its corners.' },
  globetrotter:  { icon: '🌍', title: 'Globetrotter',     desc: 'Claim a corner on two different continents.' },
  fiveCities:    { icon: '🏭', title: 'Going Global',     desc: 'Take five cities and unlock Operations.' },
  industrialist: { icon: '🚜', title: 'Industrialist',    desc: 'Build every farm and factory in one city.' },
  trucker:       { icon: '🚚', title: 'On the Road',      desc: 'Buy your first delivery truck.' },
  fullMenu:      { icon: '🧃', title: 'Full Menu',        desc: 'Offer all four enhancers at once.' },
  wasteNot:      { icon: '🍋', title: 'Waste Not',        desc: 'Finish a corner without a single lemon spoiling.' },
  tycoon:        { icon: '👑', title: 'Tycoon',           desc: 'Bank $1,000 in cash.' },
  dedicated:     { icon: '📅', title: 'Dedicated',        desc: 'Play 50 days total, across every corner.' },
};

/**
 * `ctx` is a grab-bag of the numbers achievements care about — every field
 * is optional, callers pass whatever they actually have on hand. Conditions
 * are checked against live state rather than one-time events, so calling
 * this repeatedly is always safe: an id only ever unlocks once.
 */
export function evaluateAchievements(ctx, unlocked) {
  const newly = [];
  const check = (id, condition) => {
    if (condition && !unlocked[id]) newly.push(id);
  };

  check('firstCup', (ctx.cupsSoldEver || 0) >= 1);
  check('soldOut', !!ctx.soldOutToday);
  check('perfectPour', (ctx.bestQualityToday || 0) >= 0.98);
  check('centuryDay', (ctx.cupsToday || 0) >= 100);
  check('firstCorner', (ctx.cornersClaimed || 0) >= 1);
  check('homeTown', (ctx.citiesClaimed || 0) >= 1);
  check('globetrotter', !!ctx.hasUSCorner && !!ctx.hasEUCorner);
  check('fiveCities', (ctx.citiesClaimed || 0) >= 5);
  check('industrialist', !!ctx.allBuildingsInOneCity);
  check('trucker', !!ctx.trucksBought);
  check('fullMenu', (ctx.enhancersOfferedTogether || 0) >= 4);
  check('wasteNot', !!ctx.cleanRunFinished);
  check('tycoon', (ctx.peakMoney || 0) >= 1000);
  check('dedicated', (ctx.daysPlayed || 0) >= 50);

  return newly;
}
