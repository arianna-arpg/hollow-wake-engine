# Hit landing

The optional `@hollow-wake/engine/combat/hit-landing` service owns damage admission
and the first eighteen statements of the damaging-hit branch in the original
`World.resolveHit`, ending after damage-pool feeding. The original baseline was
frozen before this extraction. The game adapter composes the service after hit
preparation and retains the remaining hit body in `continueLandedHit`. Underlying
damage, status and effect-dispatch capabilities retain their separate contracts.

## Source and observations

The [source boundary](../baseline/hit-landing/source-boundary.json) records the
exact original statements, hashes, positions and next statement. The
[acceptance record](../baseline/hit-landing/acceptance.json) pins the observer and
compressed expectations. Two original captures, the installed predecessor and
Node 22 agree byte-for-byte across 112 scenarios. Normal verification cannot
regenerate accepted expectations.

The observer runs the complete original resolver and real damage implementation.
Its simulation tap only retains identities and records results. It does not
substitute outcomes or mutate gameplay records. Explicit host-callback cases
exercise nested hits, live mutations and five intentional failures. Other cases
use native block, evasion, immunity, damage pools, consumable buffs, healing,
account deeds and mimic capture. Recorded state includes query and random order,
borrowed identities, account/actor state, cues and committed partial changes.

Positive assertions separately prove that named scenarios reached their intended
outcomes. Forty-eight deliberate source faults distinguish admission, captures,
deed eligibility, refusal termination, reaction order, identity and pool entry
snapshotting. An unrelated exception fails a fault check; it is not counted as
evidence of detection.

## Behavioral boundary

Damage admission uses the definition captured by hit preparation or the explicit
force flag. Delivery effects alone do not admit damage. A target-specific skill
replacement can therefore supply a different packet while the incoming definition
continues to determine admission.

For a damaging hit, player deed binding happens before life, hidden state and
panic are captured. Assault packet mutation follows those snapshots, then native
damage executes. Self-damage accounting floors overkill at zero. Critical state
is captured before account bookkeeping; total damage is captured later, after
refusal handling and mimic capture. These capture points must remain distinct.

Evasion and passive block each terminate the complete hit after their ordered
rewards and reactions. Block thorns precede charge taps, healing, recent-event
stamps, buff consumption, procs and triggers. Only depth exactly zero taps block
charges. A seeping block can kill, but its healing and triggers precede the death
check. An immune contact knocks fixtures with the captured tone and a false
wounding flag before returning.

A landed zero-damage contact is distinct from a refusal. Received amounts may
still cause a struck reaction, while recent-hit/hurt stamps and damage pools
require positive captured damage. Struck/hurt reactions borrow the same received
amounts. Positive damage stamps both actors, then critical stamps, then hurt
reactions. Pool feeding snapshots packet entries after those callbacks; later
banking callbacks cannot change the values already selected by that snapshot.

Mimic capture occurs only for a player recipient and enemy source after refusal
handling. The existing watch/capture implementation retains its own content,
study, capacity and deduplication policy. This boundary owns the occurrence and
ordering of that call, not a replacement mimic implementation.

## Portable contract

`createHitLanding(ports).land(...)` accepts the same fifteen arguments as the
preparation service's continuation. It uses explicit synchronous ports, borrowed
records and invocation-local state. Active player identity and time remain live
host reads. Host callbacks can reenter, change state or throw; already committed
changes remain. Actor kind may be absent; only the explicit player kind admits
mimic watching. Positions are host-defined and need no coordinate fields.

Successful landing calls `ports.continue` with the fifteen prepared arguments,
damage-admission flag, captured damage, captured critical state and the borrowed
native result, in that order. Non-damaging hits continue with false, zero, false
and an absent result. Evaded, blocked and immune hits terminate without calling
the continuation. Its return value is forwarded. The native result is not copied:
its later fields may differ from the earlier scalar captures.

The continuation adds no per-hit result wrapper, argument array or closure.
Existing deed/proc records and entry snapshots still allocate as in the source;
this is not a zero-allocation claim. The game binding retains cue construction,
live tracker/max-life/config evaluation, trigger aiming, mimic policy and pool
banking as host operations. Source guards pin all moved statements and both
remaining hit sections, including their exact text after the move. They also
guard the damage import and retirement of the now-unused concealment import.

The module is optional and does not enter the eager core graph. Its separate
8 KiB unminified JavaScript limit preserves every predecessor package budget.
This packaging limit is not a physical-device performance result.

## Observer repairs before acceptance

The first draft set block chance to one, but the original sheet caps it at 0.6.
Several named block scenarios therefore did not block. Explicit controlled random
draws now select the intended native outcome, and positive assertions verify
block results, depth gates, buff consumption and healing before death checks.

The pool fallback draft supplied an undefined raw amount before native damage,
producing a non-finite life result. It now supplies a valid zero amount to damage
and changes that entry during the hurt callback before banking. Every scenario
is checked for finite actor life, and the exact ordered bank values are asserted.

Removing the assault callback initially exposed a dependency in the observer:
later callback courses accessed packets retained only by that removed hook. The
read-only hit tap now retains packets independently. Original trace bytes are
unchanged by that repair. Only the explicitly skipped intentional failure is
permitted when its invoking source statement is removed.

## Reproduction and limits

Run `npm run reference:hit-landing` against the preserved source capsule and
`npm run test:hit-landing-observer` for a control plus 48 disposable source faults.
The reference runner also accepts `--game <path>` for an installed game copy.
The observer checks full native outcomes before comparing immutable trace bytes.
CI runs both commands and retains reports and diagnostic logs.

The [baseline evidence](../evidence/hit-landing/baseline-windows.json) records
the separately published pre-extraction observations, draft failures and source
preservation. `adapter:hit-landing` checks the installed archive and repeats the
same original observations. `adapter:hit-landing-source` checks source guards;
`adapter:hit-landing-faults` tests changes in a disposable installed runtime.
The full SDK verifier includes independent contract tests, runtime faults and a
clean package consumer with type and browser checks. Runtime acceptance also
requires the broader game gates, native course and whole-hit measurements.

The full game adapter captures the landing closure directly when binding hit
preparation. Landing initializes first, and the guarded source transform rejects
an unreviewed preparation initializer. This avoids two forwarding frames during
nested hits while retaining the preparation-only continuation. See the
[native stack investigation](native-stack-investigation.md) for the reproduced
hosted failure, candidate repair and remaining acceptance.

The remaining hit path, sustain, threat, world reactions, delivery, death,
underlying host verbs and complete Unity/Godot/Unreal packages are separate work.
Physical Steam Deck and older-mobile acceptance remains open. Content authoring
can use the [storage pipeline](content-storage.md); database queries do not belong
inside this per-hit phase. This extraction changes no storage format.

## Extraction acceptance

The [runtime evidence](../evidence/hit-landing/runtime-windows.json) records
1,186 passing SDK tests, the 112 installed landing courses, 27 independent tests
on Node 22 and 24, all 41 runtime faults on both versions, 31 source controls,
eight installed faults and a clean package/type/browser consumer. All seventeen
game verification groups pass, including the earlier preparation/effects/damage/
status/attack comparisons, six rule probes and 25 smoke episodes. Pinned reference
verification passes without changing accepted expectations.

The optional entry contributes 5,967 JavaScript bytes. All 261 predecessor
compiled files remain byte-identical. The native full-attack comparison matches
original and installed execution in QuickJS-NG; its previously accepted small
facing-angle differences from Node remain separately bounded. This experiment
does not establish complete Unity, Godot or Unreal package support.

### Timing remains open

Desktop measurements cover the complete warmed hit resolver, with equal reset/
setup costs, 1,500 warmups and nine batches of 1,000 hits. The initial sequence
and its identical repeat use previous/current/current/previous order (ABBA).
The third sequence reverses that order (BAAB). Each ratio divides the median of
the current run medians by the median of the previous run medians. A ratio above
one means higher measured time. Every series is retained; no best run is selected.

| Workload | Initial ABBA | Repeated ABBA | Reversed BAAB |
| --- | ---: | ---: | ---: |
| plain | 1.164 | 1.033 | 1.000 |
| authored | 1.351 | 1.119 | 1.021 |
| stat | 1.319 | 1.022 | 0.978 |
| rider | 1.236 | 1.062 | 0.999 |
| impale | 1.234 | 0.979 | 0.801 |

The initial 16–35% increase prompted the extra measurements. Substantial variation
in the unchanged predecessor and sensitivity to process order prevent a stable
regression or parity conclusion. Timing acceptance remains open. These results
do not establish the absence of a regression. All runtime and game inputs stayed
unchanged during the investigation.

A separate diagnostic profile used 45 batches for the authored-status workload
after the same warmup. The existing host StatSheet.compute accounted for about
63% of previous and 62% of current sampled self time. The new landing module and
its binding together accounted for about 2.1% of current sampled self time.
Those samples identify where to investigate; they neither measure causal overhead
nor replace the unprofiled comparisons. Full profiles and instrumentation are
retained in the raw evidence. The host stat evaluator is the next measured
optimization candidate and remains distinct from the SDK's standalone stat engine.

Machine: Intel(R) Core(TM) i9-10900K CPU @ 3.70GHz, win32/x64.
No physical Steam Deck/mobile acceptance or general speedup is claimed. Retained
heap after forced GC is recorded and does not measure total allocation volume.
Core benchmarks passed separately. The verification sequence completed its heavier
checks before measurement; the focused profile ran after all timing series.
