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

  // Difficulty
  hardWon:       { icon: '🟠', title: 'No Slack',         desc: 'Clear a corner on Hard difficulty.' },
  impossibleWon: { icon: '🔴', title: 'Against The Odds', desc: 'Clear a corner on Impossible difficulty.' },
  allTiers:      { icon: '🎯', title: 'Every Rung',       desc: 'Win at least one corner at every difficulty tier.' },

  // Territory
  tenCorners:    { icon: '📍', title: 'Ten Corners',      desc: 'Claim 10 street corners.' },
  fiftyCorners:  { icon: '🗺️', title: 'Fifty Corners',     desc: 'Claim 50 street corners.' },
  hundredCorners:{ icon: '🧭', title: 'A Hundred Strong', desc: 'Claim 100 street corners.' },
  tenCities:     { icon: '🌆', title: 'Metropolis',       desc: 'Take ten entire cities.' },
  worldChampion: { icon: '🏆', title: 'World Champion',   desc: 'Take every city on the map.' },

  // Money
  bigSpender:    { icon: '💵', title: 'Five Grand',       desc: 'Bank $5,000 in cash.' },
  highRoller:    { icon: '💰', title: 'High Roller',      desc: 'Bank $25,000 in cash.' },
  mogul:         { icon: '🏦', title: 'Mogul',            desc: 'Bank $100,000 in cash.' },
  treasuryTen:   { icon: '🪙', title: 'War Chest',        desc: 'Grow the campaign treasury to $10,000.' },
  bestRank:      { icon: '👑', title: 'Lemonade Tycoon',  desc: 'Earn the top rank in a free-play season.' },

  // Supply chain
  firstBuilding: { icon: '🏗️', title: 'Groundbreaking',   desc: 'Build your first farm or factory.' },
  threeIndustrial:{ icon: '🏭', title: 'Vertical Integration', desc: 'Build every farm and factory in three different cities.' },
  fleetOfFive:   { icon: '🚛', title: 'Small Fleet',      desc: 'Own 5 delivery trucks at once.' },
  fleetOfTen:    { icon: '🚚', title: 'Logistics Network', desc: 'Own 10 delivery trucks at once.' },

  // Cup sizes & BYO
  goSmall:       { icon: '🥤', title: 'Small Talk',       desc: 'Sell your first small cup.' },
  goBig:         { icon: '🧋', title: 'Go Big',           desc: 'Sell your first large cup.' },
  ecoFriendly:   { icon: '🌱', title: 'Bring Your Own',   desc: 'Sell your first BYO cup.' },
  ecoWarrior:    { icon: '♻️', title: 'Eco Warrior',       desc: 'Sell 100 BYO cups over your lifetime.' },
  fullSpread:    { icon: '🍹', title: 'Full Spread',      desc: 'Sell a small, a medium, a large, and a BYO cup all in one day.' },

  // Enhancers
  firstUpsell:   { icon: '🧃', title: 'Say Yes To The Extra', desc: 'Sell your first enhancer.' },
  flavorFanatic: { icon: '🍓', title: 'Flavor Fanatic',   desc: 'Sell 100 enhancers over your lifetime.' },

  // Endurance & consistency
  centurion:     { icon: '📆', title: 'Centurion',        desc: 'Play 100 days total, across every corner.' },
  veteran:       { icon: '🎖️', title: 'Veteran',          desc: 'Play 365 days total, across every corner.' },
  qualityStreak: { icon: '🌟', title: 'Consistently Good', desc: 'Average 90%+ quality across an entire run.' },
  neverExpire:   { icon: '⏳', title: 'Frozen In Time',    desc: 'Unlock never-expiring lemons.' },

  // Banking
  firstDeposit:    { icon: '🏦', title: 'Rainy Day Fund',   desc: 'Make your first deposit at the bank.' },
  compoundInterest:{ icon: '📈', title: 'Compound Interest', desc: 'Earn $500 in bank interest over your lifetime.' },

  // Card payments
  cardCarrier:     { icon: '💳', title: 'Card Carrier',     desc: 'Sell 100 cups paid for by card, over your lifetime.' },
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

  const tiersWon = ctx.tiersWon || [];
  check('hardWon', tiersWon.includes('hard') || tiersWon.includes('impossible'));
  check('impossibleWon', tiersWon.includes('impossible'));
  check('allTiers', ['easy', 'medium', 'hard', 'impossible'].every((t) => tiersWon.includes(t)));

  check('tenCorners', (ctx.cornersClaimed || 0) >= 10);
  check('fiftyCorners', (ctx.cornersClaimed || 0) >= 50);
  check('hundredCorners', (ctx.cornersClaimed || 0) >= 100);
  check('tenCities', (ctx.citiesClaimed || 0) >= 10);
  check('worldChampion', (ctx.citiesClaimed || 0) >= (ctx.totalCities || Infinity));

  check('bigSpender', (ctx.peakMoney || 0) >= 5000);
  check('highRoller', (ctx.peakMoney || 0) >= 25000);
  check('mogul', (ctx.peakMoney || 0) >= 100000);
  check('treasuryTen', (ctx.treasury || 0) >= 10000);
  check('bestRank', !!ctx.topRankFreePlay);

  check('firstBuilding', !!ctx.anyBuildingBuilt);
  check('threeIndustrial', (ctx.citiesFullyBuilt || 0) >= 3);
  check('fleetOfFive', (ctx.trucksCount || 0) >= 5);
  check('fleetOfTen', (ctx.trucksCount || 0) >= 10);

  check('goSmall', (ctx.smallSoldEver || 0) >= 1);
  check('goBig', (ctx.largeSoldEver || 0) >= 1);
  check('ecoFriendly', (ctx.byoSoldEver || 0) >= 1);
  check('ecoWarrior', (ctx.byoSoldEver || 0) >= 100);
  check('fullSpread', !!ctx.allSizesInADay);

  check('firstUpsell', (ctx.enhancersSoldEver || 0) >= 1);
  check('flavorFanatic', (ctx.enhancersSoldEver || 0) >= 100);

  check('centurion', (ctx.daysPlayed || 0) >= 100);
  check('veteran', (ctx.daysPlayed || 0) >= 365);
  check('qualityStreak', (ctx.consistentQuality || 0) >= 0.9);
  check('neverExpire', !!ctx.neverExpireLemons);

  check('firstDeposit', !!ctx.everDeposited);
  check('compoundInterest', (ctx.interestEarnedEver || 0) >= 500);

  check('cardCarrier', (ctx.cardCupsEver || 0) >= 100);

  return newly;
}
