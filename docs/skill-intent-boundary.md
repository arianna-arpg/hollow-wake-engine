# Skill intent and temporary-instance ownership: original boundary

The original observations are accepted in [the baseline record](../baseline/milestone-thirty-one/acceptance.json). No skill-intent runtime is implemented by this baseline.
The source remains the pinned original game at
`88e135e6c85d301ee7c0c3641f9fc2f92be0e140`, including its preserved overlay.
No current candidate implementation supplies expected results.

## Extraction unit

Extract the complete readiness/face path and the temporary state it owns:
`castSealed`, `castReqRefusal`, `skillUsable`, `pressUsable`, `slotFaceOf`,
`comboQueuedStep`, `comboCursorOf`, `comboStepOf` and `mintMetaInstance`, with
the cast-seal matcher, live rule registry and validation helpers.

Keep actual `useSkill` request dispatch in the game for this unit. It must call
the extracted seal, attribute, mint and combo methods in the original order.
The original 763-line dispatcher also owns held-body struggle, replenishment,
trigger arming, reserve spending, aim, interruptions, spatial targets, effect
dispatch and casting-mode selection. Moving its queries does not extract these
other responsibilities. This scope must remain explicit in the completion map.

## Invariants the API must preserve

- Actor admission, HUD readiness, press readiness and actual request authority
  are separate operations. HUD readiness is supplementary: it can remain true
  for an unaffordable or busy actor. Trigger-equipped skills always report false
  through that HUD operation even when their button can arm/disarm them.
- A sealed request stops before dwell interruption, resource use and trigger
  toggles. A refusal line is optional and applies to a deliberate seat press.
  Redirects re-enter the original request path, including its seal check.
- Cast-seal matching uses skill or host identity first, context tags second,
  then registered laws in authored order. A matching shut row wins over open;
  a seat-only seal skips unseated actors before running predicates. Unknown laws
  match nothing. Re-registering replaces a live rule without changing its order.
  Validation preserves duplicate missing-id diagnostics and authored row order.
- Registered predicates and conversion rules are live callbacks. Do not assume
  purity, memoize their answers or eagerly evaluate skipped lanes. Give each SDK
  registry an explicit owner; preserve the game's existing registration surface
  only in its compatibility adapter.
- Attribute authority resolves the caster's seat. Unlearned payloads, gifts,
  active auras and strobes are exempt in the original method. The actual
  requirement text remains the host's live authored/build query, including its
  limited local development override. HUD readiness is not this authority.
- Face/press queries prefer a selected mimic art, then a queued combo step,
  then a qualifying conversion. An empty mimic makes press readiness false;
  the face method can continue to other faces. The actual request dispatcher
  checks conversion before mimic. Preserve these observed distinctions; do not
  unify them as part of extraction or silently fix a synthetic combination.
- Mimic selection can repair a missing selection to the newest art. Combo
  queries can allocate a cursor or mint a step. Ammunition reads can create a
  bank. These queries are not universally pure or transactional.
- A combo window includes its exact endpoint. Base, repeated, absent and
  out-of-range steps return null. A step uses base level plus floored bonus
  levels, shares sockets/grafts, refreshes tree modifiers and retains host/chain
  identity. Meta payloads instead use the host's effective level; do not merge
  these two level rules.
- Meta instances are cached per actor and host-id/payload-id. Equivalent host
  objects can reuse an ordinary payload; relocation payloads must also retain
  the exact host object. Command-host payloads omit the usual host scope.
- A construct borrowing a skill owns its cursor per World, actor and host id.
  A construct using its own bar uses instance state. A nonconstruct borrower
  also uses instance state in the original. Retain the distinction, weak actor
  ownership, cache reuse and remint conditions.

## Raw observations already reproduced

`export-skill-intent.ts` records 29 native query courses, 195 transitions and
32 cast-seal rows. `export-skill-instance-identity.ts` records 29 cache/cursor
transitions. Both passed simulation type checks and matched byte-for-byte in two
fresh original processes and the retained v0.26 installation. Capture receipts
record helper and output hashes. Their historical investigation labels are superseded by the acceptance record.

The intent helper explicitly omits only a `gatesMet` forwarding trace nested
inside `canUse`, already moved into the M30 actor policy. Direct HUD gate calls,
state changes, results and other instrumented host calls remain visible. This
diagnostic choice is made before any M31 implementation.

`export-cast-request.ts` additionally exercises real request dispatch and
redirect/cast-start paths. Its 20 courses and 22 transitions passed type checks and matched two
original runs and the retained v0.26 installation byte-for-byte. Those observations are accepted in the same record. The first type-check failure was a harness-only
TypeScript narrowing issue after resetting `casting`; the assertion now reads
the post-operation snapshot. No game or SDK behavior was changed.

## Acceptance and performance work

1. Original request observations and scope review are complete.
2. Hashed original fixtures are frozen separately from implementation;
   `npm run reference:intent` reproduces them without regenerating expected results.
3. Define small host-independent contracts with instance-owned rules and weak
   cursor ownership. Preserve borrowed object identities and lazy work.
4. Add independent rule/order/exception/ownership tests plus deliberate faults
   for early authority, priority, window endpoints, cache remint and isolation.
5. Integrate guarded overlays against original and retained v0.26 bytes, then
   test the installed package through both queries and actual cast requests.
6. Exercise original native probes and rendered input, and retain prior casting,
   payment, admission, smoke and original-preservation checks.
7. Measure rotating original/v0.26/candidate readiness and native cast-start
   workloads; profile allocation/retention before changing caching or layout.
   A desktop improvement is not Steam Deck or mobile acceptance.

No per-frame database access is warranted by this boundary. Immutable content
lookup and live actor state have different lifetimes. The optional catalogue
database remains an authoring/query tool; selected runtime data stays resident.
