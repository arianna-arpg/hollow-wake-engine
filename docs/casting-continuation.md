# Casting continuation

`@hollow-wake/engine/casting/continuation` provides `CastingContinuation` for the
ordered update and click phases of a running cast. Use it with `SkillDispatch`
for request-to-update orchestration. It composes the existing mode runtimes;
actual effects, spatial queries, input occurrence and presentation remain host
services. This is an optional alpha contract.

The [original boundary](casting-continuation-boundary.md) and
[immutable baseline](../baseline/milestone-thirty-five/acceptance.json) define
the observed behavior. The shipped
[3D example](../examples/casting-continuation.mjs) runs a request, two updates,
delivery, an idle click and a sealed refusal through the installed package.

## State and host integration

Create one controller per simulation and retain its ports. `advance(actor, dt)`
advances that actor's active cast; `press(actor)` records a repeated-input timing
attempt. Both return `void`. The actor owns its cast record, cooldown maps and
recovery fields. The controller holds no actor cache, event queue, frame snapshot
or mutable shared registry.

The generic parameters describe actor, skill instance, cast, aim, resolved target,
stat tags, stat modifiers and identity. Identity defaults to `number` and can be
`string`. Aim may represent any host dimensions. `assignAim` mutates a borrowed
aim in place; `copyAim` returns an independent owned value. These operations are
deliberately distinct because existing casts and observers can retain references.

Bind `advanceGuard`, `advanceChannel` and `advanceCharged` to the already-tested
mode runtimes. The Hollow Wake adapter supplies them lazily so construction order
does not capture an uninitialized service. Concentration, ordinary progression
and timing clicks call the existing stateless helpers directly.

Bind `click` back to the host's public click method, which then calls `press`.
This preserves observers and input activity on an AI timing click. It must not
re-enter `advance`. The host owns the clock and must not additionally advance the
same cast through its previous update implementation.

`channelGrace` uses seconds; `focusSlack` uses the host's distance units. They are
finite, nonnegative and copied at construction. Hollow Wake supplies its original
configuration. Frame scheduling supplies seconds under `hollow-wake-frame/v1`.
This controller preserves existing leaf validation and idle early returns; it
does not establish a new universal validation policy for arbitrary cast records
or invalid frame values. Definitions and borrowed state must satisfy the
corresponding dispatch and mode contracts.

## Ordering and failure behavior

Readers are synchronous, pure observations. Mode predicates skip irrelevant
authority queries; hosts must not attach effects to those queries. Sinks can affect
later observations. Effects and construction see a cleared active cast and the
original recovery stamp. Guard lowering instead sees the interrupted cast and
its shell before removal. Focus fizzle feedback occurs before the live contextual
and global cooldown queries. A timing cue precedes the flawless trigger.

Exceptions propagate. The controller does not roll back earlier mutations or
hold a busy latch. A failed guard-lowering callback leaves the original active
state; a failed interruption cue sees already-cleared state. A failed completed
delivery retains completion and recovery. A timing-cue failure retains the spent
click, preventing a later duplicate timing award. Hosts must not interpret these
callbacks as durable transactions or automatically replay them.

The primary-player hold predicate and seated-actor finesse/aim predicates remain
separate. Hold decisions precede progress advancement. Large frames do not insert
hidden timing clicks. These rules are observable in original-game co-op and AI
courses and are not changed by this extraction.

## Cost and compatibility limits

Ongoing updates have no controller-owned receipt or actor-copy allocation.
The game adapter returns directly for idle actors, avoiding an unnecessary SDK
call. The controller also supports direct idle calls and skips authority queries
that cannot affect the active mode.
Original terminal delivery options, aim copies and vessel specifications remain
at their original semantic boundaries. This is a structural property, not an
allocation or frame-time measurement. The optional emitted module has a 10 KiB
unminified JavaScript ceiling within the unchanged 448 KiB combined ceiling.
The core entry does not eagerly import it.

`npm run reference:continuation` replays the frozen original without regenerating
accepted results. `npm run adapter:continuation-source` checks both method guards,
newline styles and unrelated-member preservation. `npm run adapter:continuation`
compares the installed game and detects deliberate behavior changes. The SDK
verifier includes independent controller tests and a packed 3D consumer with
browser, network and ambient random access disabled.

`benchmark:continuation` compares the frozen original, a retained v0.29 adapter
and the candidate using equal gameplay receipts and rotating sample order.
An optional `--comparison-adapter <independent-game>` includes a fourth control;
its source and runtime hashes are checked before and after the run. Use
`--validate-only` to validate receipts without treating those timings as evidence.

Two measured runs retained equal gameplay receipts across all four implementations.
The [raw results and decision](../evidence/milestone-thirty-five/benchmark-decision.json)
record the improvement and its limit:

| Desktop workload | Initial candidate, runs 1 / 2 | Optimized, runs 1 / 2 | Interpretation |
| --- | --- | --- | --- |
| 65,536 idle updates | 1.2488 / 1.2189 ms | 0.8752 / 0.8707 ms | Removes the added idle call; close to retained v0.29 |
| 32,768 ongoing ordinary updates | 2.7665 / 2.9386 ms | 1.3411 / 1.3990 ms | 51.5–52.4% lower than the first candidate; 39.0–45.3% lower than v0.29 |
| 576 complete nine-mode cycles | 89.1242 / 91.9354 ms | 90.3658 / 93.3487 ms | 1.4–1.5% higher than the first candidate; direction versus v0.29 reverses |

These workloads include the documented resets, assertions and result construction.
The ongoing case uses a real admitted cast with an explicitly lengthened total.
Keep the fast paths for the measured ongoing-update improvement, while tracking
the complete-cycle tradeoff. This is not a general game-speed or frame-rate claim.
The evidence includes a reverse patch for recreating the initial comparison
candidate in an isolated SDK copy; accepted gameplay fixtures remain unchanged.

The Hollow Wake binding uses the actual game effects and constructs. The 3D
example deliberately supplies only one small effect rule. Neither establishes a
complete Unity, Godot or Unreal package, Steam Deck acceptance, mobile performance
or cross-runtime lockstep determinism. Those remain separate acceptance work.
