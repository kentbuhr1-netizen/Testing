import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/ops.js';
import * as C from '../js/campaign.js';
import * as S from '../js/sim.js';

/** A campaign holding a handful of workshops, with the guild open. */
function guilded(cityId = 'sheffield', held = [0, 1, 2]) {
  const campaign = C.newCampaign();
  campaign.held[cityId] = [...held];
  campaign.guild = G.newGuild();
  campaign.capital = 1000;
  return campaign;
}

test('a journeyman may do anything a reference smith may do — except swing your hammer', () => {
  assert.ok(G.JOURNEY_DOCTRINES.length > 0);
  for (const doctrine of G.JOURNEY_DOCTRINES) {
    assert.equal(doctrine.hands, 0, 'a journeyman never has your hands');
  }
  // Everything else in the family survives: the guild is limited, not crippled.
  const has = (f) => G.JOURNEY_DOCTRINES.some(f);
  assert.ok(has((d) => d.crew === S.MAX_LEVEL));
  assert.ok(has((d) => d.dies === S.MAX_LEVEL));
  assert.ok(has((d) => d.pace > 0));
});

test('what a workshop is worth is measured, not assumed', () => {
  const rich = G.workshopOutlook('sheffield', 0);
  const poor = G.workshopOutlook('chittagong', 24);
  assert.ok(rich.pieces > 0 && rich.bars > 0 && rich.wage > 0);
  assert.ok(rich.pieces > poor.pieces,
    'a good shop should be worth more to station than a wretched one');
  // And it is stable: the same workshop always reports the same outlook.
  assert.deepEqual(G.workshopOutlook('sheffield', 0), rich);
});

test('some workshops do not make enough to cover a wage', () => {
  const outlooks = [];
  for (const city of C.CITIES) {
    for (const i of [0, 12, 24]) outlooks.push(G.workshopOutlook(city.id, i));
  }
  assert.ok(outlooks.some((o) => o.capital > o.wage), 'nothing was worth staffing');
  assert.ok(outlooks.some((o) => o.capital < o.wage), 'everything was worth staffing');
});

test('a journeyman falls short of what a smith at the anvil manages', () => {
  const config = C.runConfigFor('sheffield', 0);
  const best = Math.max(...S.DOCTRINES.map((d) => S.playDoctrine(config, d)));
  const o = G.workshopOutlook('sheffield', 0);
  assert.ok(o.pieces * config.shifts < best,
    'the guild should never match a smith working it by hand');
});

test('a depot has to be opened before anything can be bought into it', () => {
  const campaign = guilded();
  assert.equal(G.buyBars(campaign, 'sheffield', 100).ok, false);
  assert.equal(G.upgradeDepot(campaign, 'sheffield').ok, false);
  assert.equal(G.buildDepot(campaign, 'sheffield').ok, true);
  assert.equal(G.hasDepot(campaign.guild, 'sheffield'), true);
  assert.equal(G.buildDepot(campaign, 'sheffield').ok, false, 'twice is once too many');
});

test('an order may not outgrow the depot or the capital', () => {
  const campaign = guilded();
  G.buildDepot(campaign, 'sheffield');
  const depot = campaign.guild.depots.sheffield;
  assert.equal(G.buyBars(campaign, 'sheffield', depot.capacity + 1).ok, false);
  assert.equal(G.buyBars(campaign, 'sheffield', 0).ok, false);
  campaign.capital = 0.01;
  assert.equal(G.buyBars(campaign, 'sheffield', 1000).ok, false);
});

test('stock is cheaper by the ton', () => {
  assert.equal(G.bulkDiscount(0), 1);
  assert.ok(G.bulkDiscount(4000) < G.bulkDiscount(800));
  assert.ok(G.wholesaleCost(4000) < G.wholesaleCost(2000) * 2);
});

test('you may only station a journeyman on a workshop you hold', () => {
  const campaign = guilded('sheffield', [0]);
  assert.equal(G.stationSmith(campaign, 'sheffield', 5).ok, false);
  assert.equal(G.stationSmith(campaign, 'sheffield', 0).ok, true);
  assert.equal(G.stationSmith(campaign, 'sheffield', 0).ok, false, 'already staffed');
  assert.equal(G.isStaffed(campaign.guild, 'sheffield', 0), true);
  assert.equal(G.standDownSmith(campaign, 'sheffield', 0).ok, true);
  assert.equal(G.standDownSmith(campaign, 'sheffield', 0).ok, false);
});

test('hiring and building cost what they say they cost', () => {
  const campaign = guilded();
  const before = campaign.capital;
  G.buildDepot(campaign, 'sheffield');
  assert.equal(campaign.capital, before - G.DEPOT_COST);
  G.stationSmith(campaign, 'sheffield', 0);
  assert.equal(campaign.capital, Math.round((before - G.DEPOT_COST - G.SMITH_HIRE_COST) * 100) / 100);
});

test('a supplied journeyman draws stock and turns out work', () => {
  const campaign = guilded();
  G.buildDepot(campaign, 'sheffield');
  G.buyBars(campaign, 'sheffield', 5000);
  G.stationSmith(campaign, 'sheffield', 0);
  const before = campaign.guild.depots.sheffield.bars;

  const summary = G.runGuildShifts(campaign, 5);
  assert.equal(summary.shifts, 5);
  assert.ok(summary.pieces > 0);
  assert.deepEqual(summary.dry, []);
  assert.ok(campaign.guild.depots.sheffield.bars < before, 'no stock was drawn');
  assert.equal(campaign.stats.piecesMade, summary.pieces);
});

test('wages are owed whether the stock turned up or not', () => {
  const dry = guilded();
  G.stationSmith(dry, 'sheffield', 0);          // no depot at all
  const summary = G.runGuildShifts(dry, 4);
  assert.deepEqual(summary.dry, ['sheffield']);
  assert.ok(summary.costs > 0, 'a dry shop still owes its wages');
  assert.ok(summary.pieces > 0, 'an unsupplied journeyman still makes something');
  assert.equal(dry.guild.alerts.length, 1);

  const supplied = guilded();
  G.buildDepot(supplied, 'sheffield');
  G.buyBars(supplied, 'sheffield', 5000);
  G.stationSmith(supplied, 'sheffield', 0);
  const full = G.runGuildShifts(supplied, 4);
  assert.ok(full.pieces > summary.pieces, 'stock has to be worth buying');
});

test('a depot that runs out mid-run leaves its journeymen standing', () => {
  const campaign = guilded();
  G.buildDepot(campaign, 'sheffield');
  G.buyBars(campaign, 'sheffield', 250);        // a shift or two at most
  G.stationSmith(campaign, 'sheffield', 0);
  const summary = G.runGuildShifts(campaign, 20);
  assert.deepEqual(summary.dry, ['sheffield']);
  assert.ok(campaign.guild.depots.sheffield.bars < G.workshopOutlook('sheffield', 0).bars);
});

test('the guild does nothing at all until it exists', () => {
  const campaign = C.newCampaign();
  assert.equal(G.runGuildShifts(campaign, 5), null);
  assert.equal(G.networkOutlook(campaign), null);
  campaign.guild = G.newGuild();
  assert.equal(G.runGuildShifts(campaign, 0), null, 'no shifts worked, nothing happens');
});

test('the preview and the ledger agree about a shift', () => {
  const campaign = guilded();
  G.buildDepot(campaign, 'sheffield');
  G.buyBars(campaign, 'sheffield', 5000);
  G.stationSmith(campaign, 'sheffield', 0);
  G.stationSmith(campaign, 'sheffield', 1);

  const preview = G.networkOutlook(campaign);
  const worked = G.runGuildShifts(campaign, 1);
  assert.equal(preview.smiths, 2);
  assert.equal(worked.pieces, preview.pieces);
  assert.ok(Math.abs(worked.costs - preview.costs) < 0.02);
  assert.ok(Math.abs(worked.net - preview.net) < 0.02);
  assert.equal(campaign.guild.ledger[0].shift, 1);
});

test('the ledger keeps the last twenty shifts and no more', () => {
  const campaign = guilded();
  G.stationSmith(campaign, 'sheffield', 0);
  for (let i = 0; i < 30; i++) G.runGuildShifts(campaign, 1);
  assert.equal(campaign.guild.ledger.length, 20);
  assert.equal(campaign.guild.ledger[0].shift, 30, 'newest first');
});

test('a network that costs more than it makes takes the difference out of capital', () => {
  const campaign = guilded();
  // A shop that cannot cover its own wage, left unsupplied.
  const poor = C.CITIES.flatMap((c) => [0, 12, 24].map((i) => [c.id, i]))
    .find(([id, i]) => {
      const o = G.workshopOutlook(id, i);
      return o.capital < o.wage;
    });
  assert.ok(poor, 'no unprofitable workshop to test with');
  campaign.held[poor[0]] = [poor[1]];
  G.stationSmith(campaign, poor[0], poor[1]);
  const before = campaign.capital;
  const summary = G.runGuildShifts(campaign, 10);
  assert.ok(summary.net < 0, `expected a loss, got ${summary.net}`);
  assert.equal(campaign.capital, Math.round((before + summary.net) * 100) / 100);
});

test('coke is never stockpiled — a depot holds bar stock and nothing else', () => {
  const campaign = guilded();
  G.buildDepot(campaign, 'sheffield');
  assert.deepEqual(Object.keys(campaign.guild.depots.sheffield).sort(), ['bars', 'capacity']);
});
