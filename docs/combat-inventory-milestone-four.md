# Milestone four: Node/Godot reference integration

Status: locally qualified desktop reference candidate. The bounded implementation
and local gates are complete; hosted platform results accompany the published commit.
This follows the bounded [combat/Inventory plan](combat-inventory-plan.md).
Engine `0.62.0-candidate.0`, combat `0.2.0-candidate.0` and the new
`@hollow-wake/node-godot` `0.1.0-candidate.0` are engineering candidates.

## Usable result

The [reference player](../examples/node-godot/README.md) installs five local
archives into a clean consumer. Its Node host owns the character and combat
clock; the Godot 4.7.2 client renders bodies, projectiles and fields, accepts
walking/aim/cast input, and previews/applies equipment, support and passive
changes. A trusted skill-gallery option exposes the authored combat effects.
The exported player is tested with its source scene unavailable.

The [adapter contract](node-godot-adapter.md) maps the existing Node/Godot and
Ground seams. Its small deterministic floor, wall and raised platform are
replaceable spatial providers. Neither the original game nor the evolving 3D
game, generation framework or other sessions is modified.

Ordinary movement now passes through the original combat mover. Cast/channel
mobility, guard restrictions, roots, stun/confusion, traction, movement-built
charges, tethers, flying/levitation and stride/idle state retain their rules.
Host callbacks return detached physical poses; the SDK applies them and owns
combat restrictions. Geography-specific speed factors are explicit host facts.
SDK body/segment queries are available to spatial adapters without requiring
them to write combat hit attribution.

The default character store is in memory. A separately loaded file example
demonstrates replacing storage through `load/save` without changing combat.
It admits character investment, not accounts, campaigns or live-world snapshots.
No persistence call runs in a simulation step. Optional extensions remain
preserved and independently regression-tested.

## Original and installed evidence

| Course | Evidence |
|---|---|
| Ordinary movement | 19 frozen original-only courses, 1,951 observations |
| Flight and levitation | Two additional frozen original-only courses, 204 observations |
| Installed Node adapter | 107 courses, 4,483 observations in each of two fresh consumers |
| Theorycrafting through the adapter | Three original build courses, 30 observations, including Vocation/XP grants and live cast rebuilds |
| Adapter contracts | 31 checks covering authority, preview/publication, grant revision delivery, framing, queues, hold/disconnect, collisions, layers and replaceable storage |
| Movement ownership | 11 checks for detached inputs/results, invalid duration/pose, foreign handles, reentry and failure quarantine |
| Extension independence | 66 optional runtime/declaration files physically removed before installed replay |
| Godot interaction | Actual editor and exported player: walk, hit a target, preview and commit equipment/support/passive changes |

The five skills requiring unprovided world services (`town_portal`,
`shatterstep`, `kindle_wick`, `steam_vent`, `steam_veil`) continue to refuse
explicitly. The reference does not invent their geography/weather/campaign
services. The inherited 70-family composed SDK qualification remains the
coverage boundary; representative courses are not exhaustive build combinations.

The flight probe exposed two missing extracted displacement constants, which
are now pinned with the original method provenance. A swept-wall test caught
and corrected tunnelling in the sample space provider. These tests are retained.
Normal verification never regenerates the accepted original observations.

## GitHub verification correction

The first action for this milestone was checking the M3
[GitHub run](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/43810474982).
Node 24, the original-reference job and both native jobs passed. Both Node 22
package jobs failed at the body-construction census.

The 4,822-body investigation found 560 tiny Node 22 differences in exactly two
outputs: turn speed and base weight. The maximum absolute difference was
`3.552713678800501e-15`. Running the pinned original in two fresh Node 22
processes reproduced every difference exactly. This is cross-runtime
`Math.pow` rounding, not an SDK rule divergence; the language specifies an
[implementation-approximated result](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.pow).

The census now compares the SDK exactly against the original on the running
runtime. The original-to-frozen comparison allows at most four representable
steps only for those two positive, finite morphology fields. Everything else
remains exact, with negative controls for changed rules, NaN and one-step life
changes. Accepted recordings and original source hashes are unchanged. Node 22
reports 560 qualified rounding differences; Node 24 reports zero.

## Reproduction and limits

Local qualification on 16 November 2026 passed the complete 149-stage `verify`
and 63-stage `reference:verify` recipes. The unit suite passed 2,612 tests;
the final combat gates passed 68 runtime checks and 43 original-only checks.
Node 22 also passed the installed adapter and exact same-runtime original
body census. Windows Godot 4.7.2 passed both the rendered editor and exported
player course. See the [recorded evidence](../evidence/combat-inventory-milestone-four/verification.json).

An initial local attempt stopped because an older package test used an
inaccessible Windows temporary directory. The complete rerun confined temporary
files to an owned workspace directory and removed it afterward. Three older
clock/recovery harnesses now also clean their consumers in `finally`; their
existing checks passed. No accepted original observations were revised.

Run `npm run verify` and `npm run reference:verify` after preparing the pinned
reference. The first includes `test:node-godot`; the second independently
reproduces the original movement courses. Run the exported-player course with
`node scripts/test-node-godot-player.mjs --tools <tools.json>`; add `--render`
for a visible rendering check. GitHub runs the new player course on Windows
and Linux, alongside the existing Node 22/24 package matrix.

Build a reusable reference distribution with
`node scripts/build-node-godot.mjs --out <new-directory>`. The builder refuses
overwrites and the tests remove their owned installations, exports and caches.
Pinned existing local tools are reused rather than downloading another editor.

This qualifies the local desktop reference-integration boundary.
It does not qualify native mobile Node hosting, multiplayer, Unity or Unreal.
Milestone five measures composed workload costs and optimizes demonstrated
bottlenecks. Steam Deck and older mobile devices require named-device runs;
successful desktop export is not a performance claim. Milestone six finishes
the bounded release packaging and adoption walkthrough.

The first published GitHub run reached both player jobs but their tool setup
failed before launching Godot: `.artifacts` did not yet exist in either clean
checkout. The setup now creates that directory before resolving it. A clean
workspace regression probe reaches the download boundary and verifies cleanup
after a simulated download failure. This corrects the harness bootstrap; the
recorded local player results remain unchanged. The corrected GitHub player
jobs must still run to qualify their platforms.
