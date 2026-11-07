# Resource conduits

Import `advanceConduits` and `validateConduitSpec` from `@hollow-wake/engine/resources/conduits`. Conduits transfer resources while a skill is engaged or a passive is worn. A game can use its existing actor, skill instances, stat sheet and resource meters.

After installing the package, run `node node_modules/@hollow-wake/engine/examples/conduits.mjs` to try a complete Ice Shield example. Glacial Reservoir spends 1.6 unreserved mana and restores 3.2 guard over half a second. Lowering the guard stops the transfer.

```ts
const readers = {
  specs: instanceConduits,
  tags: (skill: SkillInstance) => skillContextTags(skill),
  modifiers: instanceMods,
};

// Once per simulation step, at the resource-pump point in the actor's update.
advanceConduits(actor, elapsedSeconds, readers);
```

The three readers above are game-provided functions. `specs` returns the skill's innate pumps, admitted socket and passive-graft pumps, then pumps from invested tree nodes, in source order. The returned list must stay stable for that skill's sweep. A subsequent skill reads the current build. The SDK skips these readers entirely for an inactive skill. Keep them free of gameplay side effects.

Actors supply their current skill seats, casting state, aura and summon-toggle membership, optional worn conduit rows, meters and gain methods. Use the host's normal healing, energy shield, ward, and poise methods so existing recovery modifiers, break events, and spend callbacks still run. All state belongs to the supplied actor. A held guard, channel, charge, or overcharge engages a matching definition ID. An aura or summon toggle can independently engage that skill. Worn rows run last using the untagged conduit stats.

## Content and timing

The optional `ConduitCatalogue` and `content/conduits.json` ship all 20 authored sources in the pinned game. The catalogue indexes two innate skill entries, eight support entries, one skill-tree entry, five plain passives and four passive choices. `get('choice', optionId, groupId)` and `get('passive', nodeId)` return worn pumps for the selected allocations.

Resolve `catalogue.forSkill(skillId, admittedSupportIds, investedNodeIds)` when the build changes. Supply socket IDs in admitted order, followed by admitted graft IDs. Repeated supports and investments retain their occurrences. Entries and resolved arrays are immutable; multiple actors can share a loadout. A game with live definition edits can instead bind the three readers directly to its own content services.

Validate custom rows at content load. A conduit names `from`, `to`, and `ratio`, with optional `drainPct`, `drainFlat`, and `floor`. All numeric values must be finite and nonnegative. The floor is a fraction from zero to one. Passive grant compilation uses the same validator.

With the default rules, the pump respects a 15% source reserve unless the row overrides it. Life has a separate 10% hard floor, and a destination with under half a point of room idles. Hosts may pass their stable authored `floor`, `lifeFloor` and `minRoom` as the fourth argument. Supply finite reserve fractions in [0,1] and a finite nonnegative room threshold.

The tick first limits the withdrawal by source availability and destination room at the current exchange rate. It then feeds the amount that actually left the source. Mana uses the unreserved maximum. Ward uses its current value as the percentage base. A broken poise pool can yield zero, and a lowered guard has no shield room. A healing seal or ward-gain multiplier can change the delivered gain.

Call with the simulation's original steps. For example, two percentage drains from ward read two different balances. Keep preview, replay, save and resumed simulation on the same step sequence. Effects run synchronously. If a spend callback throws, earlier writes are visible and retrying the whole frame can spend twice. Persist the actor and its build through the host's existing save owner.

## Reproduction

In an SDK source checkout, install the locked development dependencies, run `npm run reference:prepare` and `npm run reference:install` to prepare the original-game capsule and tools, then run `npm run build`. Games that consume the packaged module only need the SDK archive.

- `npm run reference:conduits` checks the source capsule and the installed package against the frozen actor states. It also runs the original passive route, passive weave and starter-tree game probes through the adapter.
- `npm run benchmark:conduits` times the conduit portion of a 24-actor simulation using 8 seats and 120 steps. Original and SDK runs alternate, and every timed run must match the checksum.
- `node scripts/test-game-conduits.mjs --working-game <game-checkout>` also compares that checkout's current engine and content to the installed binding. The source substitution for this comparison is in memory.
- `--integrated-game <prepared-game>` compares a previously integrated game's actor with its installed SDK against that same host with the candidate package and conduit binding. Both checkouts are read-only inputs.

## Steam Deck and phone benchmark

Open the standalone `hollow-wake-conduits-device-0.58.0-candidate.0.html` from the candidate directory in a browser. Choose an actor count, enter the device and power mode if known, run the course in the foreground and save the JSON report. It works offline. A backgrounded run or a meter mismatch discards its results.

The page runs 24, 120 or 480 actors with eight seats. The three controlled loadouts use the original Wellspring Stance, Stone Communion, and Ice Shield's Glacial Reservoir tree pick. Each replay checks mana, poise and the raised shield at both original time boundaries. Each timing block includes 16 steps, reset and comparison. Reports retain the complete series, package digest and source-observation digest. The page measures this resource workload separately from rendering and the rest of the game.

To rebuild and retain the SDK archive, page and receipt, run `node scripts/test-game-conduits.mjs --benchmark --electron <electron-executable> --record` after the SDK build. Add `--working-game <game-checkout>` to verify the current game as well. The committed reference and the installed package are sufficient to verify the frozen course.

The package entry runs in JavaScript hosts. Its callbacks and actor state must be bound separately in each native engine adapter.
