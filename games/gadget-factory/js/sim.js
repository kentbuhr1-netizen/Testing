/**
 * Gadget Factory — the idle engine.
 *
 * One tier at a time: tap the floor to assemble units, sell them, spend the
 * cash on machines and upgrades, and watch the machines keep going after you
 * put the phone down. Reach the tier's threshold and you can prestige —
 * reset this tier's floor, keep every dollar you ever earned as a permanent
 * multiplier, and come back to it faster than before.
 *
 * `lifetimeCash` is never stored on a floor: it belongs to the campaign, not
 * the tier, and a prestige on one tier has to raise the multiplier everywhere
 * else immediately, including a floor already open elsewhere. Every function
 * below that needs it takes it as a plain argument instead.
 *
 * Everything here is pure and DOM-free: no `Math.random()`, no `Date.now()`.
 * Real elapsed time is a parameter to `advance`, not something the sim reads
 * for itself — that is what lets offline earnings, and the reference bot that
 * sets each tier's threshold, replay identically from node.
 */

const round2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * The economy
 * ------------------------------------------------------------------ */

export const MACHINE_COST_GROWTH = 1.15;   // the classic idle-game cost curve
export const UPGRADE_COST_GROWTH = 1.13;
export const TAP_LEVEL_GAIN = 0.15;        // units per tap, added per tap-power level
export const SPEED_LEVEL_GAIN = 0.12;      // machine output, added per speed level
export const PRICE_LEVEL_GAIN = 0.10;      // sell price, added per price level
export const GRID_PER_LEVEL_GAIN = 0.5;    // grid capacity multiplier added per grid level

/** The permanent multiplier a prestige buys: the classic "number goes up faster" curve. */
export function prestigeMultiplier(lifetimeCash) {
  return 1 + Math.sqrt(Math.max(0, lifetimeCash) / 1_000_000) * 0.5;
}

export const NO_UPGRADES = { tap: 0, speed: 0, price: 0, grid: 0 };

/** What the next level of an upgrade costs. */
export function upgradeCost(tier, kind, level) {
  return round2(tier.upgradeBaseCost[kind] * Math.pow(UPGRADE_COST_GROWTH, level));
}

/** What the next unit of a machine costs. */
export function machineCost(tier, machineId, owned) {
  const machine = tier.machines.find((m) => m.id === machineId);
  return round2(machine.baseCost * Math.pow(MACHINE_COST_GROWTH, owned));
}

/** Units produced per tap, before price. */
export function unitsPerTap(state) {
  return 1 + state.upgrades.tap * TAP_LEVEL_GAIN;
}

/**
 * Raw machine throughput, before the grid caps it. Machines run on
 * electricity; tapping does not, which is why a tap always lands at full
 * value even on a factory whose grid is maxed out.
 */
export function rawMachineOutput(tier, state) {
  const speedMult = 1 + state.upgrades.speed * SPEED_LEVEL_GAIN;
  let out = 0;
  for (const machine of tier.machines) {
    out += (state.machines[machine.id] || 0) * machine.baseRate * speedMult;
  }
  return out;
}

/**
 * The grid ceiling. Capacity is a persistent upgrade, but it is never a
 * stockpile: nothing here banks unused throughput from a quiet second for a
 * busy one. A factory with three machines and one connection wastes the
 * third machine's output every single second until the grid catches up.
 */
export function gridCapacity(tier, state) {
  return tier.baseGrid * (1 + state.upgrades.grid * GRID_PER_LEVEL_GAIN);
}

/** What the grid actually lets through this instant. */
export function machineOutput(tier, state) {
  return Math.min(rawMachineOutput(tier, state), gridCapacity(tier, state));
}

/** What one unit sells for right now. */
export function sellPrice(tier, state, lifetimeCash) {
  return tier.basePrice * (1 + state.upgrades.price * PRICE_LEVEL_GAIN) * prestigeMultiplier(lifetimeCash);
}

/** Idle income, per second, at the current loadout. */
export function incomePerSecond(tier, state, lifetimeCash) {
  return round2(machineOutput(tier, state) * sellPrice(tier, state, lifetimeCash));
}

/* ------------------------------------------------------------------ *
 * Starting and resetting a tier
 * ------------------------------------------------------------------ */

export function newRun() {
  return {
    cash: 0,
    totalEarnedThisRun: 0,
    machines: {},
    upgrades: { ...NO_UPGRADES },
  };
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/** Tap the floor once. Pure: returns the units and cash it earned. */
export function tap(tier, state, lifetimeCash) {
  const units = unitsPerTap(state);
  const cash = round2(units * sellPrice(tier, state, lifetimeCash));
  state.cash = round2(state.cash + cash);
  state.totalEarnedThisRun = round2(state.totalEarnedThisRun + cash);
  return { units, cash };
}

/** Buy one more unit of a machine, if the floor can afford it. */
export function buyMachine(tier, state, machineId) {
  const owned = state.machines[machineId] || 0;
  const cost = machineCost(tier, machineId, owned);
  if (cost > state.cash) return { ok: false, why: 'Not enough cash.' };
  state.cash = round2(state.cash - cost);
  state.machines[machineId] = owned + 1;
  return { ok: true, cost };
}

/** Buy the next level of an upgrade, if the floor can afford it. */
export function buyUpgrade(tier, state, kind) {
  const level = state.upgrades[kind];
  const cost = upgradeCost(tier, kind, level);
  if (cost > state.cash) return { ok: false, why: 'Not enough cash.' };
  state.cash = round2(state.cash - cost);
  state.upgrades[kind] = level + 1;
  return { ok: true, cost };
}

/** Whether the tier's threshold has been reached. */
export function canPrestige(tier, state) {
  return state.totalEarnedThisRun >= tier.prestigeThreshold;
}

/**
 * Reset the floor, keep the cash you ever earned as a permanent multiplier.
 * Refuses below the threshold — the soft wall the GDD calls for — so a
 * player never resets away progress by mistake before it has paid for itself.
 * Returns the fresh floor and how much lifetime cash the reset just banked;
 * the campaign is what actually carries `lifetimeCash` forward.
 */
export function prestige(tier, state) {
  if (!canPrestige(tier, state)) return { ok: false, why: 'This floor has not earned enough yet.' };
  return { ok: true, state: newRun(), earned: state.totalEarnedThisRun };
}

/**
 * Advance idle time. Pure: `seconds` and `lifetimeCash` are supplied by the
 * caller (real elapsed time and the campaign's running total, or a reference
 * bot's own clock and ledger), never read from anywhere else — that is what
 * lets offline earnings, and the reference bot that sets each tier's
 * threshold, replay identically from node.
 */
export function advance(tier, state, seconds, lifetimeCash) {
  if (seconds <= 0) return { earned: 0 };
  const earned = round2(incomePerSecond(tier, state, lifetimeCash) * seconds);
  state.cash = round2(state.cash + earned);
  state.totalEarnedThisRun = round2(state.totalEarnedThisRun + earned);
  return { earned };
}

/* ------------------------------------------------------------------ *
 * Reference play
 *
 * A greedy bot used to set each tier's unlock threshold: spend on whatever
 * buys the most extra income per second per dollar, tap during the active
 * window a real session would have, idle for the rest, and prestige the
 * instant the tier allows it. It does not need to be perfectly optimal —
 * outbreak's own reference family is not either — only good enough that a
 * threshold measured against it is an honest bar and not a guess.
 * ------------------------------------------------------------------ */

export const ACTIVE_SECONDS = 30 * 60;     // a realistic tapping burst
export const IDLE_SECONDS = 4 * 3600;      // and the idle stretch after it
export const SESSION_SECONDS = ACTIVE_SECONDS + IDLE_SECONDS;
export const TAP_RATE = 2;                 // taps per second, while actively playing

/** Every purchase the bot could make right now. */
function candidates(tier, state, lifetimeCash) {
  const out = [];
  for (const machine of tier.machines) {
    const owned = state.machines[machine.id] || 0;
    out.push({ kind: 'machine', id: machine.id, cost: machineCost(tier, machine.id, owned),
      gain: estimateMachineGain(tier, state, machine.id, lifetimeCash) });
  }
  for (const kind of ['speed', 'price']) {
    out.push({ kind: 'upgrade', id: kind, cost: upgradeCost(tier, kind, state.upgrades[kind]),
      gain: estimateUpgradeGain(tier, state, kind, lifetimeCash) });
  }
  out.push({ kind: 'upgrade', id: 'grid', cost: upgradeCost(tier, 'grid', state.upgrades.grid),
    gain: estimateUpgradeGain(tier, state, 'grid', lifetimeCash) });
  return out.filter((c) => c.gain > 0);
}

/**
 * How much extra income/sec one more unit of a machine would add right now.
 * Never the machine's raw rate on its own — a machine bought past what the
 * grid can carry adds nothing at all, and a bot that priced it as if it did
 * would waste money the true-optimal player would spend on the grid instead.
 */
function estimateMachineGain(tier, state, machineId, lifetimeCash) {
  const before = incomePerSecond(tier, state, lifetimeCash);
  const owned = state.machines[machineId] || 0;
  const trial = { ...state, machines: { ...state.machines, [machineId]: owned + 1 } };
  return incomePerSecond(tier, trial, lifetimeCash) - before;
}

/** How much extra income/sec one more level of an upgrade would add right now. */
function estimateUpgradeGain(tier, state, kind, lifetimeCash) {
  const before = incomePerSecond(tier, state, lifetimeCash);
  const trial = { ...state, upgrades: { ...state.upgrades, [kind]: state.upgrades[kind] + 1 } };
  return incomePerSecond(tier, trial, lifetimeCash) - before;
}

/** Best return per dollar among everything currently on offer. */
function bestCandidate(tier, state, lifetimeCash) {
  const list = candidates(tier, state, lifetimeCash);
  if (list.length === 0) return null;
  return list.reduce((a, b) => (b.gain / b.cost > a.gain / a.cost ? b : a));
}

function applyCandidate(tier, state, pick) {
  if (pick.kind === 'machine') return buyMachine(tier, state, pick.id);
  return buyUpgrade(tier, state, pick.id);
}

/**
 * Play one tier as well as a well-informed player reasonably could, for one
 * realistic session, and report the lifetime cash it ends with (after any
 * prestiges the session had time for).
 */
export function playReference(tier, startLifetimeCash = 0) {
  let state = newRun();
  let lifetimeCash = startLifetimeCash;
  let elapsed = 0;

  while (elapsed < SESSION_SECONDS) {
    // Spend everything there is a use for before letting time pass.
    let bought = true;
    while (bought) {
      const pick = bestCandidate(tier, state, lifetimeCash);
      bought = pick && pick.cost <= state.cash && applyCandidate(tier, state, pick).ok;
    }

    if (canPrestige(tier, state)) {
      const result = prestige(tier, state);
      if (result.ok) { lifetimeCash += result.earned; state = result.state; continue; }
    }

    const tapping = elapsed < ACTIVE_SECONDS;
    const tapRate = tapping ? TAP_RATE * unitsPerTap(state) * sellPrice(tier, state, lifetimeCash) : 0;
    const rate = incomePerSecond(tier, state, lifetimeCash) + tapRate;
    const pick = bestCandidate(tier, state, lifetimeCash);
    const nextBoundary = tapping ? ACTIVE_SECONDS - elapsed : SESSION_SECONDS - elapsed;

    if (!pick || rate <= 0) {
      if (rate <= 0) break;   // nothing left worth buying and nothing coming in
      advance(tier, state, nextBoundary, lifetimeCash);
      elapsed += nextBoundary;
      continue;
    }

    const needed = Math.max(0, pick.cost - state.cash);
    const wait = Math.min(needed / rate, nextBoundary, SESSION_SECONDS - elapsed);
    advance(tier, state, wait, lifetimeCash);
    // The tap rate above approximates many small taps; folding it in here
    // keeps `advance` itself honest that idle time only ever earns from
    // machines, while still crediting the active window for real tapping.
    if (tapping) {
      const tapCash = round2(tapRate * wait);
      state.cash = round2(state.cash + tapCash);
      state.totalEarnedThisRun = round2(state.totalEarnedThisRun + tapCash);
    }
    elapsed += wait;
  }

  return lifetimeCash + state.totalEarnedThisRun;
}

/**
 * The lifetime cash a well-played session finds by the end of one tier's
 * threshold, starting fresh. This is what a tier's unlock bar is measured
 * against — never a number someone guessed.
 */
export function parLifetimeCash(tier) {
  return Math.round(playReference(tier, 0));
}
