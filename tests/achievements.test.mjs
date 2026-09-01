import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, evaluateAchievements } from '../js/achievements.js';

test('every achievement has an icon, title and description', () => {
  for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
    assert.ok(a.icon, `${id} missing an icon`);
    assert.ok(a.title, `${id} missing a title`);
    assert.ok(a.desc, `${id} missing a description`);
  }
});

test('nothing unlocks from an empty context', () => {
  assert.deepEqual(evaluateAchievements({}, {}), []);
});

test('an id already unlocked never comes back around', () => {
  const ctx = { cupsSoldEver: 5 };
  assert.deepEqual(evaluateAchievements(ctx, { firstCup: { at: 1 } }), []);
});

test('day-level achievements fire on the numbers that earned them', () => {
  assert.deepEqual(evaluateAchievements({ cupsSoldEver: 1 }, {}), ['firstCup']);
  assert.deepEqual(evaluateAchievements({ soldOutToday: true }, {}), ['soldOut']);
  assert.deepEqual(evaluateAchievements({ bestQualityToday: 0.99 }, {}), ['perfectPour']);
  assert.deepEqual(evaluateAchievements({ bestQualityToday: 0.9 }, {}), []);
  assert.deepEqual(evaluateAchievements({ cupsToday: 100 }, {}), ['centuryDay']);
  assert.deepEqual(evaluateAchievements({ cupsToday: 99 }, {}), []);
});

test('campaign-level achievements track corners and cities', () => {
  assert.deepEqual(evaluateAchievements({ cornersClaimed: 1 }, {}), ['firstCorner']);
  assert.deepEqual(evaluateAchievements({ citiesClaimed: 1 }, {}), ['homeTown']);
  const fiveCities = evaluateAchievements({ citiesClaimed: 5 }, {});
  assert.ok(fiveCities.includes('homeTown'));
  assert.ok(fiveCities.includes('fiveCities'));
});

test('globetrotter needs a corner on both continents, not just one', () => {
  assert.deepEqual(evaluateAchievements({ hasUSCorner: true }, {}), []);
  assert.deepEqual(evaluateAchievements({ hasEUCorner: true }, {}), []);
  assert.deepEqual(evaluateAchievements({ hasUSCorner: true, hasEUCorner: true }, {}), ['globetrotter']);
});

test('operations achievements check buildings, trucks and enhancer variety', () => {
  assert.deepEqual(evaluateAchievements({ allBuildingsInOneCity: true }, {}), ['industrialist']);
  assert.deepEqual(evaluateAchievements({ trucksBought: true }, {}), ['trucker']);
  assert.deepEqual(evaluateAchievements({ enhancersOfferedTogether: 3 }, {}), []);
  assert.deepEqual(evaluateAchievements({ enhancersOfferedTogether: 4 }, {}), ['fullMenu']);
});

test('wasteNot and tycoon and dedicated read their own thresholds', () => {
  assert.deepEqual(evaluateAchievements({ cleanRunFinished: true }, {}), ['wasteNot']);
  assert.deepEqual(evaluateAchievements({ peakMoney: 999.99 }, {}), []);
  assert.deepEqual(evaluateAchievements({ peakMoney: 1000 }, {}), ['tycoon']);
  assert.deepEqual(evaluateAchievements({ daysPlayed: 49 }, {}), []);
  assert.deepEqual(evaluateAchievements({ daysPlayed: 50 }, {}), ['dedicated']);
});

test('difficulty achievements read the tiers actually won, not just any win', () => {
  assert.deepEqual(evaluateAchievements({ tiersWon: ['easy', 'medium'] }, {}), []);
  const hardWin = evaluateAchievements({ tiersWon: ['easy', 'hard'] }, {});
  assert.deepEqual(hardWin, ['hardWon']);
  const allFour = evaluateAchievements({ tiersWon: ['easy', 'medium', 'hard', 'impossible'] }, {});
  assert.ok(allFour.includes('hardWon'));
  assert.ok(allFour.includes('impossibleWon'));
  assert.ok(allFour.includes('allTiers'));
});

test('territory milestones scale past the original corner and city counts', () => {
  assert.deepEqual(evaluateAchievements({ cornersClaimed: 10 }, {}).sort(), ['firstCorner', 'tenCorners'].sort());
  assert.deepEqual(evaluateAchievements({ cornersClaimed: 100 }, {}).sort(),
    ['firstCorner', 'tenCorners', 'fiftyCorners', 'hundredCorners'].sort());
  assert.deepEqual(evaluateAchievements({ citiesClaimed: 25, totalCities: 25 }, {}).sort(),
    ['homeTown', 'fiveCities', 'tenCities', 'worldChampion'].sort());
});

test('cup sizes, BYO and enhancers unlock from lifetime totals, not one day', () => {
  assert.deepEqual(evaluateAchievements({ smallSoldEver: 1 }, {}), ['goSmall']);
  assert.deepEqual(evaluateAchievements({ largeSoldEver: 1 }, {}), ['goBig']);
  assert.deepEqual(evaluateAchievements({ byoSoldEver: 1 }, {}), ['ecoFriendly']);
  assert.deepEqual(evaluateAchievements({ byoSoldEver: 100 }, {}).sort(), ['ecoFriendly', 'ecoWarrior'].sort());
  assert.deepEqual(evaluateAchievements({ allSizesInADay: true }, {}), ['fullSpread']);
  assert.deepEqual(evaluateAchievements({ enhancersSoldEver: 100 }, {}).sort(), ['firstUpsell', 'flavorFanatic'].sort());
});

test('money, buildings, trucks and quality achievements read their own fields', () => {
  assert.deepEqual(evaluateAchievements({ peakMoney: 25000 }, {}).sort(), ['tycoon', 'bigSpender', 'highRoller'].sort());
  assert.deepEqual(evaluateAchievements({ treasury: 10000 }, {}), ['treasuryTen']);
  assert.deepEqual(evaluateAchievements({ topRankFreePlay: true }, {}), ['bestRank']);
  assert.deepEqual(evaluateAchievements({ anyBuildingBuilt: true }, {}), ['firstBuilding']);
  assert.deepEqual(evaluateAchievements({ citiesFullyBuilt: 3 }, {}), ['threeIndustrial']);
  assert.deepEqual(evaluateAchievements({ trucksCount: 10 }, {}).sort(), ['fleetOfFive', 'fleetOfTen'].sort());
  assert.deepEqual(evaluateAchievements({ consistentQuality: 0.95 }, {}), ['qualityStreak']);
  assert.deepEqual(evaluateAchievements({ neverExpireLemons: true }, {}), ['neverExpire']);
  assert.deepEqual(evaluateAchievements({ daysPlayed: 365 }, {}).sort(), ['dedicated', 'centurion', 'veteran'].sort());
});

test('banking achievements read the bank account, not just cash on hand', () => {
  assert.deepEqual(evaluateAchievements({ everDeposited: true }, {}), ['firstDeposit']);
  assert.deepEqual(evaluateAchievements({ interestEarnedEver: 500 }, {}), ['compoundInterest']);
  assert.deepEqual(evaluateAchievements({ interestEarnedEver: 499.99 }, {}), []);
});

test('card payment achievements read lifetime card cups, not one day', () => {
  assert.deepEqual(evaluateAchievements({ cardCupsEver: 99 }, {}), []);
  assert.deepEqual(evaluateAchievements({ cardCupsEver: 100 }, {}), ['cardCarrier']);
});

test('a rich context can unlock several achievements in one pass', () => {
  const ctx = {
    cupsSoldEver: 200,
    cornersClaimed: 3,
    citiesClaimed: 1,
    peakMoney: 1200,
    daysPlayed: 60,
  };
  const newly = evaluateAchievements(ctx, {});
  assert.deepEqual(newly.sort(), ['dedicated', 'firstCorner', 'firstCup', 'homeTown', 'tycoon'].sort());
});
