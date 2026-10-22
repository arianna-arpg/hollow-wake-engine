# Skill request preflight: original boundary

The [acceptance record](../baseline/milestone-thirty-three/acceptance.json)
freezes 68 original request courses and 71 transitions before the request
runtime is implemented. Two fresh original processes and the retained v0.27.1
adapter produce identical bytes. Expected results include meaningful call
order, state and return values without diagnostic projection.

The source is the pinned game at `88e135e6c85d301ee7c0c3641f9fc2f92be0e140`
with its preserved overlay. Helper, source-prefix and fixture hashes are in the
acceptance record. `npm run reference:request` checks those hashes and reproduces
the observations without overwriting accepted results.

## Extraction unit

Extract the first sixteen top-level statements of `World.useSkill`, ending
immediately before `if (caster.reserves && caster.reserveSpecs)`. Preserve this
order:

1. Cast seal.
2. Hive-form request.
3. Throng travel, drive and carry refusal.
4. Passive replenishment preference.
5. Seat activity.
6. Held-body struggle and reflex exemption.
7. Gnaw ownership.
8. Mounted movement refusal.
9. Active aura debt and life locks.
10. Trigger toggle or stale-depth clearing.
11. Attribute requirement.
12. Conversion redirect.
13. Mimic redirect.
14. Prerequisite note.
15. Relocation target availability.
16. Actor admission.

Reserve spending, combo commitment, random fumble and scramble, targeting,
paid-mode preparation and general effect delivery remain host-owned after this
prefix. Readiness and face queries remain separate from actual request authority.

## Proposed runtime contract

A World owns one request policy and supplies explicit live host ports. Its
preflight operation returns `false` for terminal refusal, `true` for a terminal
handled request, or the scalar `'continue'` to enter the remaining host pipeline.
This avoids allocating a result wrapper on each request. A successful request
can be a toggle or redirect; it does not guarantee a cast began or an effect
landed. No new persistent actor or instance store belongs to this policy.

The ports cover sealing, authored rules, possession and seat lookup, actor
lookup, prerequisites, admission, temporary instance minting, redispatch,
relocation lookup and ordered feedback. The host owns spatial state, time,
definitions and notifications. Borrowed actor and instance fields remain live.
Constructor binding must not read or cache a gameplay answer.

## Observable invariants

- A truthy seal, including an empty object, refuses before all other operations.
  Its optional line speaks only on a seat press. Hive-form dispatch follows and
  coalesces an undefined result to false.
- Replenishment checks precede seat activity and held-body checks. Its seat path
  reads delivery twice. Toggling mutates the flag, forgets replenishment state,
  resolves the seat, marks its metadata if present, marks character data dirty,
  then emits feedback in that order.
- A refused request may still mark seat activity, increase a holder's struggle
  or clear a stale trigger depth. There is no rollback or transaction promise.
- Trigger metadata lookup uses the seat whose actor is exactly the caster.
  This differs from possession-aware `seatOf`; the adapter must preserve two
  distinct ports. Trigger state exists before reading whether it is armed.
  A toggle raises the use lock to at least 0.25 without reducing a longer lock.
- Debt and life locks precede trigger handling and attributes. Life exactly at
  the authored threshold can release; life above it cannot.
- Attributes precede conversion, which precedes mimic. Redirects re-enter the
  actual host request method with the same aim and seat-press flag. Minted
  instances share the host's socket array. Mimic power is read after minting and
  socket assignment, preserving live callback ordering.
- Prerequisites precede relocation queries, which precede actor admission.
  `canUse` can lazily create ammunition state. Ports are not universally pure;
  skipped callbacks must remain skipped and exceptions must not be masked.

## Evidence and limits

The baseline includes real hive possession/ejection, authored Gnatveil transit
investment, tree-enabled passive replenishment and workshop deployment and
movement. Other courses explicitly seed body flags, banks and synthetic
combinations of existing definition fields to isolate competing gates.

An early interaction test incorrectly assumed native Mimicry had attribute
requirements. The registry has none. The accepted fixture preserves its
successful low-attribute redirect and separately tests attribute-before-mimic
ordering with attribute-bearing Firebolt carrying the mimic trait. No game
behavior or accepted result was changed to satisfy that assumption.

This baseline establishes neither a new runtime nor performance, allocation,
renderer, physical-input or native-engine acceptance. Subsequent implementation
must pass independent rule/order/ownership tests, deliberate fault controls and
the unchanged observations through a separately installed adapter. Benchmark
complete request workloads against retained controls before making speed claims.
Desktop measurements do not establish Steam Deck or mobile performance.

No database query belongs in this request loop. Authored content may be compiled
or queried offline; live actor state and selected runtime definitions must remain
available in memory. Storage and layout changes need their own measured case.
