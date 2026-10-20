# Milestone two — casting, Burning and the first adapter

The package now runs the ordinary cast lifecycle and one time-dependent effect
outside the game. The first Hollow Wake adapter uses the same extracted rules
inside a separate game checkout. The owner's primary checkout and unfinished
work remain untouched.

The independent original-game exporter drives real `World.useSkill`,
`World.updateCasting`, `Actor.updateTimers`, `Actor.applyStatus` and `applyDot`.
Successful casts execute their real payload and create projectiles. Expected
results are captured from hash-verified source, without importing the SDK.

Seven casting paths cover payment, refusal, instant casts, minimum duration,
mid-cast speed changes, release, cooldown recovery, completion repricing, stun and
host interruption. Two Burning paths cover weaker/equal/stronger refresh,
attribution, duration/expiry scaling, zero duration, expiry overshoot and damage
taken with high armor/resistance. Every standalone transition is save/restored.
Separate adversarial checks cover invalid frames, bounded cooldown capacity,
interleaved actors, corrupt snapshots and duplicate completion prevention.

The first fixture calibration inherited the original actor's passive life
regeneration. The exporter was corrected to set target regeneration to zero;
only recorded target-life values changed. The reviewed before/after values are
retained in `evidence/milestone-two/fixture-calibration.json`. M1 goldens and the
source capsule were not changed. Normal verification never accepts new expected
outputs automatically.

The dedicated game checkout starts at the committed baseline. Its World differs
from the frozen source only by the owner's five bounty-board edits; these were
reviewed and a second exact source hash is accepted by the adapter. No copy of
the owner's unfinished overlay was written into the active game checkout.

## Reproduce

```sh
npm ci
npm run verify
npm run reference:prepare
npm run reference:install
npm run reference:verify
npm run reference:lifecycle
npm run adapter:prepare
npm run adapter:verify
npm run example:lifecycle
npm run benchmark:lifecycle
```

Adapter preparation reconstructs a separate game under `.artifacts/game-adapter`,
installs the pinned verification tools separately, and installs the actual
packed SDK offline into a clean consumer. It does not mutate `.reference` or use
another checkout's dependencies. It refuses an existing destination/bridge or
unreviewed source hashes. To rerun just behavior checks, use `adapter:verify`.
Preparation is deliberately a one-time operation per clean destination.

Inside the adapted game, run `npm run check`, `npm run sim -- run --suite smoke`,
and the castingcues, costlevers, overdrive, defenses and statusvoice probes. CI
performs these checks from the capsule. The full local game checkout also permits
a Vite build; the portable source capsule is not a complete release-asset bundle.

Four standalone mutation controls must fail behavioral assertions: wrong stat
increase, stale stat cache, missing cast completion and altered expiry damage.
The fifth mutates the package installed into the actual game to prove wiring.
The packed-consumer test exercises public imports without browser globals,
network or ambient randomness. Package/content size limits remain enforced.

## Remaining work

The primary game has not switched dependencies. The adapter checkout is a
reviewable integration experiment; promotion requires the game's normal branch
integration process and a decision on distributing its private first-party SDK.
The SDK repository contains everything needed to reproduce the integration.

The broader skill catalogue, complete proc/ailment application, other cast modes,
inventory policy, vocations, native engine wrappers and on-device performance
remain future milestones. No native-engine compatibility or mobile performance
guarantee follows from these tests. See [casting-contract.md](casting-contract.md)
for the exact supported behavior and [performance.md](performance.md) for budgets.
