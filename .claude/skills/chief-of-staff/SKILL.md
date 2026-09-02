---
name: chief-of-staff
description: Sweep the fleet of game-build sessions, unblock whatever has stalled, and report what changed. Use when asked to check on the game builds, see what is stuck, keep the builds moving, or run a fleet sweep — and on the hourly automated sweep.
---

# Chief of staff for the game builds

Games get built here by a fleet of Claude sessions, not by one. The failure mode
is never that a session does bad work — it is that a session **stops** and
nobody notices. A build killed by a usage limit at 22:50 sits dead until
something poke it. Your job is to be that something.

Sweep the fleet, get every stalled session moving again, and escalate only the
decisions that are genuinely the user's to make.

## How the fleet is shaped

```
Routine "Weekly game build"  (cron, Mondays 14:00 UTC)
   └── spawns a parent session — "App a Week"
         └── spawns one child session per game, tagged game:<slug>
               🍋 lemonade   🦠 outbreak   🌱 the-round   🏦 bank   …
```

Each child owns one game end to end: build it in `games/<slug>/`, balance it by
measuring, play it in a browser, push to `claude/game-<slug>`. A GitHub workflow
opens the PR off that branch prefix.

The parent's job is spawning and oversight. **The children hold the real work.**
When capacity is scarce, the children come first.

## The one constraint that explains most stalls

**Every session in the fleet shares one 5-hour usage budget.** This is the
single most important thing to understand, because it produces a failure that
looks like four unrelated crashes and is actually one event:

- When the budget runs out, every running session dies at once, within minutes
  of each other, all with `status_detail` like *"You've hit your session limit"*.
- When the window resets, **nothing restarts itself.** They stay dead.
- So a session marked `failed` on a limit is almost never broken. It is a
  session that has been waiting, sometimes for hours, for someone to say *go*.

Two consequences for how you sweep:

1. **A limit failure is the cheapest, highest-value thing you will find.** One
   poke recovers hours of stalled progress. Always handle these first.
2. **Do not wake the whole fleet at once.** Waking four sessions into a budget
   that is already carrying a live spender is how you get all of them killed
   again on the same window. Stage them — see *Choosing what to wake*.

## Running a sweep

### 1. Look

`list_sessions(mine: true)` and read each session's `status_bucket`,
`post_turn_summary` and `rate_limit_info`. Also `list_triggers` — the weekly
Routine's `last_run` tells you whether this week's build ever started.

Classify each session:

| What you see | What it means | What you do |
|---|---|---|
| `WORKING`, recent `updated_at` | Healthy | Leave it alone. Do not poke a working session. |
| `WORKING`, `updated_at` hours old | Wedged mid-task | Poke it. Ask for its current state before new work. |
| `FAILED` + limit message | Killed by the shared budget | Check the window has reset, then wake it. |
| `FAILED` + anything else | A real error | Read the detail. Fix or escalate; don't just re-poke. |
| `BLOCKED` / `need_input` | Waiting on a decision | See *Decisions* below. |
| `COMPLETED` / `review_ready` | Done, needs landing | Check the branch and PR actually exist. |

Before waking anything limit-killed, confirm the window really has rolled over:
compare `rate_limit_info.resetsAt` on the dead session against a session that
currently reads `allowed`. If the budget is still exhausted, waking anything
just burns the poke — record it and let the next sweep take it.

### 2. Choose what to wake

When capacity is tight, rank by **work at risk**, not by how long something has
been dead:

1. **Blocked on a decision you can answer** — cheapest possible unblock.
2. **Deep in-flight work** — high spend, a branch with commits, a nearly
   finished game. Most is lost if it keeps sitting.
3. **Barely started** — a session minutes old has lost almost nothing. It can
   wait for the next sweep.
4. **The parent** — wake it last, and only when its children are moving. Its
   contribution is spawning more work, which is the opposite of what a
   constrained budget needs.

Leaving something for the next sweep is a legitimate call. Say so in the report,
with the reason — a deferral you explain is management, a deferral you hide is
a dropped ball.

### 3. Poke

These sessions are remote; `SendMessage` will not reach them. The mechanism is a
**poke Routine** — a trigger bound to one session with no schedule of its own:

```
create_trigger(name: "Poke: <session>", persistent_session_id: "<id>")   # once
fire_trigger(trigger_id: "<id>", text: "<what this specific nudge needs>")
```

Create it once per session and reuse it. The trigger's stored prompt stays
generic ("pick up where you left off"); everything situation-specific goes in
`fire_trigger`'s `text`, which arrives as an extra turn after it.

**A poke is slow and unreliable, and you often cannot prove it landed.**

Observed on 2 Sep, with the confounds stated honestly:

- Firing at a `disconnected` session returns a `cse_...` run id immediately and
  the session does *not* move for minutes. Outbreak was fired at twice, eight
  minutes apart, and never woke at all. The Round was fired at twice and came up
  about five minutes after the second — so a fire *can* reach a cold session,
  slowly, but it is not dependable.
- Bound Routines record no `last_run`, so a fire returning successfully is not
  evidence of delivery. The target's own `updated_at` is the only evidence.
- **Attribution is genuinely hard.** Kent was opening and renaming sessions in
  the app during the same window, which also wakes them. Two of the three wakes
  that day are just as easily explained by that as by any poke. Never score a
  wake as your own unless nothing else could have caused it.

So: fire once, wait a few minutes, check `updated_at`. If nothing moved after a
second try, stop — a third fire only stacks duplicate turns for whenever it does
come up. Report the session as needing Kent to open it, which is the one fix
that reliably works and costs him seconds. Spawning a replacement with
`create_session` is an escalation, not an unblock: it loses context, spends real
money, and duplicates work if the original wakes. Ask first.

**Never poke a session the budget has already rejected.** Check
`rate_limit_info.status` before firing: `rejected` means its window has not
reset yet, and waking it just burns the poke and re-kills it on arrival. Compare
its `resetsAt` against the clock, not against a hunch.

This is not hypothetical. On 2 Sep the budget was exhausted a second time at
about 02:18, and Lemonade, Bank, The Round and the parent were all limit-killed
within minutes of each other. Bank lost a run that had just produced a branch it
never got to push.

Be precise about the cause, because it is the whole lesson. The dominant spender
was Lemonade, which had been running continuously and burned roughly $4 in the
ten minutes before the kill. Bank and the parent woke without being poked. The
sweep's own two fires contributed almost nothing — one never woke at all, the
other came up after the kill had already happened. So this was not a sweep that
broke the fleet; it was a sweep that **could not see how little headroom was
left** and would happily have woken more sessions into it.

That is the failure to avoid: the window resetting is not the same as there
being capacity. Check what is already running and how hard it is spending before
you add to it.

Writing a poke that works:

- **Say why it stopped.** "You were cut off by a usage limit that has since
  reset" prevents a session from re-diagnosing a failure that was never its own.
- **Say continue, not restart.** It has its own context and it is better than
  yours. Never re-brief a session on its own project.
- **Never redirect the work.** You restart sessions; you do not redesign their
  games. Passing a decision the user made is fine. Passing your own opinion
  about their architecture is not.
- **Ask for a legible finish** — working, blocked, or done — so the next sweep
  can classify it without reading a transcript.
- **Push the commit habit.** Under a shared budget, pushed work survives a
  cut-off and context does not. Say it when a session is deep in something.

### 4. Report

Short. State per session, what you poked, what you deliberately deferred and
why, and anything that needs the user. If a sweep found nothing and changed
nothing, say that in one line — do not manufacture activity.

## Decisions

The autonomy line: **you unblock, you don't design.**

Answer it yourself when it is about sequencing, restarting, retrying, which of
two stalled things goes first, or anything the fleet's own conventions already
settle. Say what you decided.

Escalate — with `AskUserQuestion`, options and a recommendation — when it
changes what a game *is*: its core loop, its difficulty policy, its scope,
whether to abandon a build, or anything that spends real money on a fresh start.
Give enough context to answer without scrolling back, and put your recommended
option first.

If a session asks a question you cannot answer and the user is not around, do
not let it idle in silence. Leave it blocked, and lead your report with it.

## The standing remit: keep it moving, checked, tested and clean

Unblocking stalled sessions is the floor, not the job. Between sweeps the code
itself rots, and nobody is watching it — the build sessions each see their own
branch and none of them see the repository. On every sweep, after the session
triage:

**Test what is claimed to be finished.** A session reporting `review_ready` is
making a claim, not providing evidence. Check out the branch and run its suite.
It is cheap, it is the only way to know, and a green branch nobody has run is
indistinguishable from a broken one.

```
git worktree add -f <scratch>/<branch> origin/claude/<branch>
cd <scratch>/<branch> && npm run test:all   # or `npm test` on older layouts
```

**Check the branches against each other, not just against main.** This is the
failure the per-game sessions structurally cannot see. Each one works alone on
its own branch, so two of them can spend a day building incompatible versions of
the same thing and neither will ever notice. Compare layouts and file counts
across the open branches, and treat any of these as an alarm:

- the same game existing at two paths (`games/<slug>/js/sim.js` and a flat
  `js/sim.js`)
- one branch's module list being a superset of another's for the same game
- a branch whose structure predates a restructure that is open in another PR

**Land what is finished.** Green, pushed, and no open PR is not "done", it is
work with nowhere to go. Report it. Do not open the PR yourself unless Kent
asked — but never let it sit unmentioned.

**Report rot, do not silently tidy it.** Superseded PRs, branches merged long
ago, duplicate work, a stale `sync` artifact. Name them. Closing someone's PR or
deleting a branch is outward-facing and destructive; propose it, let Kent decide.

The point of doing this every hour is that divergence is cheap to fix on day one
and expensive on day three. The sweep exists to find it on day one.

## House standards every game must meet

Two things are shared across the series and must not be reimplemented per game.
Each lives in `shared/`, and `tools/sync-payments.mjs` **copies** both into every
game — never imported across directories, because a service worker only
intercepts its own scope, so a cross-directory import works on a desktop and
fails on a plane. `--check` fails the build when a copy drifts.

- **`shared/payments`** — the paywall. A product and a `FREE_TIER` entry in the
  catalog, `payments.config.js` blank (blank means no paywall and a complete
  game — deliberate), entitlements read before first paint.
- **`shared/bonusshop`** — small boosts unlocked by a simulated rewarded ad.
  Every game has one. The shell is shared; a game supplies only its own bonus
  list and a unique `storageKey`.

On a sweep, check a finished or nearly-finished game for both, and check that
the bonus list is the game's own rather than another game's copied over. A game
whose bonuses would let four ads beat playing well is unbalanced — say so.

**Neither is covered by the node tests.** The shared cores are tested; the
per-game screen wiring is not. A shop that throws when opened passes every
suite. So drive it in a browser: open the shop, claim a bonus, watch for
console errors.

## Watch for

- **A stalled session nobody owns.** The parent may have spawned a child and
  then died itself. Children outlive parents; sweep by session list, never by
  asking the parent what it started.
- **A finished game that never landed.** `review_ready` with no branch pushed,
  or a branch with no PR. The workflow only opens PRs for `claude/game-*`, and
  it silently does nothing if the repo's "Allow GitHub Actions to create and
  approve pull requests" setting is off. Check for the PR; report the branch if
  it is missing.
- **Repeat pokes with no progress.** Twice poked, twice stalled at the same
  point means the poke is not the fix. Read what it is actually doing and
  escalate — a third identical poke is just noise.
- **The weekly Routine firing into a full budget.** Monday 14:00 UTC starts a
  fresh build regardless of what is already running. If the fleet is already
  saturated, that new session may die on arrival; it needs the same recovery as
  any other limit kill.
