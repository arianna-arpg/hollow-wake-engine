# Skill intent and temporary instances

Version 0.27 adds three optional, dependency-free entries:

| Entry | Responsibility |
| --- | --- |
| `casting/seals` | `CastSeals`: ordered live seal predicates, matching and authoring diagnostics |
| `casting/instances` | `SkillInstances`: borrowed actor caches, combo payloads and weak cursor/relocation ownership |
| `casting/intent` | `SkillIntent`: supplementary HUD readiness, button readiness, face selection and attribute refusal |

The [shipped example](../examples/skill-intent.mjs) connects all three without
game imports. Their structural TypeScript contracts accept host actors, skill
instances and seal types. Instantiate one intent/instance owner per simulation;
share immutable definitions when appropriate. Each seal registry has its own
ordered rules. The Hollow Wake compatibility module retains its historical
module-level registration surface; this does not make that game's registrations
isolated between Worlds.

## State and ports

Ports are shallow snapshots of callback references. Each operation reads live
host observations. Content/effective-level read ports must be synchronous and
must not change authored definitions or gameplay state themselves. Live rules
may change host state or definitions; subsequent reads observe those changes.
The factory must return a fresh skill instance. Rules and sink callbacks may throw;
operations do not roll back earlier lazy allocations or mutations. No elapsed
clock, random source, engine object, database or browser dependency is implicit.
These borrowed-state APIs expect valid authored definitions and live actor
records. They do not revalidate a content catalogue or sanitize a save on every
HUD query; perform those checks at the host's content/load boundary.

Actor `metaInsts` maps remain host-owned. Socket and graft arrays retain original
identity; combo tree modifiers refresh on each lookup. Normal meta payloads use
effective host level, while combo steps use base level plus floored bonus levels.
Relocation payloads also require the exact host object. Command-host payloads
omit host scope. Legacy cache keys (`host:payload` and `host:comboN`) are preserved:
the host must retain its existing noncolliding content-id conventions. This is
not a general arbitrary-string cache namespace.

Borrowed construct combo cursors live in a per-owner weak actor map. Own-bar
constructs and ordinary actors retain instance-state cursors. Relocation links
also use weak keys. These maps do not own actor lifetimes, but actor `metaInsts`
still owns its cached payloads until the host clears it. No unmeasured claim of
zero allocations or bounded actor-cache residency is made.
An absent instance state is initialized to an empty combo cursor. Hosts whose
state requires additional fields must initialize that state in their factory.

Readiness queries can create cursors, ammunition banks or payload instances,
and mimic selection can repair itself. HUD readiness is supplementary and can
remain true when payment or body state would refuse a cast. Trigger-equipped
skills report false through that HUD method. Face/press queries prefer mimic,
then combo, then conversion; actual requests retain the original conversion
before mimic ordering. Combo windows include their endpoint.

`castSealed` returns the original seal object. The host supplies the current
simulation seal, seat observation and matcher. Attribute refusal separately
consults the caster's seat and learned skills, preserving gift, unlearned,
active-aura and strobe exemptions. It is not inferred from HUD readiness.

## Independent evidence

The [accepted original boundary](skill-intent-boundary.md) and
[baseline record](../baseline/milestone-thirty-one/acceptance.json) precede the
implementation. `reference:intent` reproduces 278 observations from the pinned
original, without replacing expected results. The baseline covers 195 query
transitions, 32 seal rows, 29 instance/cursor transitions and 22 actual request
transitions. Both fresh original processes and retained v0.26 agreed exactly.

The installed comparison preserves the identity and request fixtures byte for
byte. Query comparison removes 118 diagnostic forwarding entries from the
**original expected trace only**: nested `castSealed`, `mintMetaInstance`,
`comboCursorOf` and `comboStepOf` entries now execute within the SDK. The exact
allowlist is operation-specific in `scripts/skill-intent-comparison.mjs`.
Direct seal/attribute calls, state, results, predicates and meaningful host calls
remain checked. Unknown operations/methods fail. The candidate is unfiltered, so
a disconnected original forwarding path does not pass this comparison. Raw
captures remain available in the generated receipt directory.

The prior admission fixture also loses 36 original `castSealed` forwarding
entries inside `hud` and `press-query` operations. Its actual `press` and
`ai-press` seal calls remain checked. This projection is applied to original
expected observations only; candidate calls and all state/results remain intact.

Independent tests cover ordering, live rule replacement, exceptions, ownership,
level rules, identity and endpoints. Eleven runtime mutations and six installed
faults exercise behavior, including native World delegation. Syntax, import and
type failures are not accepted as fault detection. The installed runner restores
all altered bytes and checks the installed build after every run. Guarded source
integration preflights both World and seal files and refuses drift before writes.

Final callback review added two original-proven contracts: validation captures
both row references before the first knowledge callback, and face selection
rereads its definition after a conversion rule runs. Both independent regressions
reject the earlier candidate. The original and both game adapters agree after
correction; [the callback record](../evidence/milestone-thirty-one/validation-order.json)
includes the reproducing probes. Accepted baseline fixtures were not changed.

Reproduce with `npm run verify`, `npm run reference:intent`,
`npm run adapter:intent-source`, then `npm run adapter:prepare` and
`npm run adapter:intent`. The adapter's checks are sequential with other checks
that temporarily mutate that same installation.

## Limits and performance

The three modules add 9,354 JavaScript bytes under a separate 12 KiB allowance;
the combined runtime bound is 424 KiB. Earlier individual module limits stay
unchanged. These are package-size bounds, not live-memory measurements.

Two rotating desktop runs compare the pinned original, retained v0.26 and this
candidate. Each has five warmups and 25 samples, with equal gameplay receipts.
Median milliseconds for each complete workload:

| Workload | Run | Original | v0.26 | v0.27 |
| --- | --- | ---: | ---: | ---: |
| 9,216 HUD/press/face queries | 1 | 35.064 | 36.695 | 35.378 |
| 9,216 HUD/press/face queries | 2 | 33.901 | 36.032 | 34.530 |
| 1,024 native query/cast starts | 1 | 48.500 | 48.439 | 49.714 |
| 1,024 native query/cast starts | 2 | 44.912 | 47.706 | 48.361 |

Final callback-corrected queries were 3.59–4.17% faster than v0.26. Native starts
were 1.37–2.63% slower; this extraction is not an overall performance improvement.
Against the original, queries were 0.89–1.85% slower and native starts 2.50–7.68%
slower. The measured native-start regression remains optimization work. These
measurements supersede the pre-correction candidate runs. See the
[measurement decision](../evidence/milestone-thirty-one/benchmark-decision.json)
and raw samples. `benchmark:intent -- --previous-adapter <retained-v0.26-game>`
checks source/runtime controls before measuring. It includes ordinary, trigger,
empty/funded gun, empty/selected mimic, combo endpoint and expiry queries.
Native starts include reset and receipt construction but no completed delivery.

Actual `World.useSkill` dispatch remains host-owned: held struggle, replenishment,
trigger arming, reserve spending, aim, interruption, targets, effect dispatch and
mode selection are not extracted by these query methods. This is a reusable
JavaScript capability, not a complete Unity, Godot or Unreal package. Desktop
measurements do not establish Steam Deck or mobile acceptance.

During verification, the original game checkout independently advanced to
`1075d260e941af0a4817e21ca32a9a55db4adeea`. Its newer work was preserved; the
SDK reference remains pinned to `88e135e6c85d301ee7c0c3641f9fc2f92be0e140`
and the captured overlay. The nine World targets and complete seal module still
pass their source guards against that updated working checkout. This is a
boundary compatibility check, not full-game acceptance of the newer main.
