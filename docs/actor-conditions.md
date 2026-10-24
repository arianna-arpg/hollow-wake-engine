# Actor conditions

M37 contract, recorded before implementation. The optional `stats/conditions`
entry evaluates Hollow Wake's 25 native conditions. Core `ConditionId` remains
an arbitrary string; applications may still supply their own conditions directly.
This entry owns one complete condition slot on a sink. It does not merge another
publisher's conditions into that slot.

## Borrowed state and evaluation

One immutable `ActorConditions` policy can serve many actors. Each actor owns its
last sampled mask (`condMask`, initially -1), publication marker (`condSheet`,
initially null), and rising-edge queue (`condRose`). Plain writable data fields
are required. Do not change these three fields during a call. The marker is
opaque: outside a call it is the confirmed sink or null; during a call it can be
an SDK sentinel. The SDK retains no actor map or per-actor service object.

The host supplies coherent, finite pool values, clocks and computed statistics,
the native nine-counter recency layout, and synchronous read ports for maximum
life, mana, shield, the actor's low-life fraction and stride reach. Reads must
not change the sampled actor. Counter index 4 (critical hits received) has no
native condition. Native counter values, including negative recency counters,
are preserved; no implicit clamping is introduced. Pool maxima may be zero.
This borrowed fast path does not repeatedly validate the host's complete state.
Configuration is validated and copied once when constructing a policy.

Read maxima in life, mana, shield order, then the low-life fraction. Read stride
reach only when accumulated distance is positive. Evaluate once against the
previously published sheet: do not iterate to a fixed point. The original
conditional-maximum course can alternate low-life state on successive calls.
Native strict/inclusive comparisons, bit order, stance precedence, combo gates
and recency inversion are preserved by the original fixtures.

The host captures native configuration when its adapter module initializes.
Each policy owns that immutable capture; later edits to a configuration object
do not retune it. Separate policies may use different settings. There is no
combat-time database lookup or mutable SDK registry. Authoring databases can
produce validated configuration without entering this per-frame path.

## Publication and events

Birth publishes its conditions without raising events. Later transitions append
newly true conditions in native declaration order while queue length is below
16. Existing entries and queue identity are preserved, including an already
overfull queue. A stable mask on the same confirmed sink suppresses publication.
A different sink receives a complete replacement without manufacturing edges.
The sink receives a detached array it may retain; stable sampling constructs no
condition array. This is not a claim about total engine or VM allocations.

Commit the sampled mask and queued edges before invoking `setConditions`.
`holds` observes that last sampled mask even inside the sink callback. A complete
replacement must be idempotent: proc effects belong to the separate event queue,
not to `setConditions`. The host may explicitly invalidate confirmation after
changing the sink externally; this retains the mask and queued events.

## Decision: condition-publication-recovery/v1

Original failure and recursion traces remain immutable in
[the accepted baseline](../baseline/milestone-thirty-seven/acceptance.json).
Two defects are intentionally corrected: unchanged state must recover after a
throwing sink, and same-actor recursive publication must not overwrite a newer
sheet with an older outer sample.

1. Reject synchronous refresh or invalidation re-entry on the same actor before
   any input read, mask change or queue append. Nesting calls for different actors
   remains valid, including through the same shared policy.
2. Propagate read or sink failures and leave publication unconfirmed. Retry a
   complete replacement on the next successful call, even if the previous sink
   applied the values before throwing. A read failure leaves mask/events intact.
3. Keep a mask and its edges already committed before a sink failure. An unchanged
   retry raises no duplicate events. A real intervening transition can raise its
   own edges. There is no rollback of host effects or transaction across callbacks.
4. If a callback catches a rejected nested call, the outer publication can finish.
   If it propagates the error, confirmation is cleared and the next call retries.
5. Confirmation belongs to the condition sink. A later gauge-publication failure
   does not invalidate a successful condition publication; the gauge publisher
   independently retries its own replacement. This removes the original accidental
   coupling through the final assignment to `condSheet`.

[Independent expected cases](../baseline/milestone-thirty-seven/publication-recovery.json)
were specified before runtime implementation. Their simple harness starts at
life 50/100, mana 50/100, no shield/poise/stance/combo/stride, and never-recent
counters. Thus the initial mask is only `notHurtRecently`; life 20 adds `lowLife`
and life 100 replaces it with `fullLife`. Each case starts after a successful
birth publication, with an empty queue, unless it explicitly targets a read.
These expectations supplement the unchanged original fixtures; they never replace
them. Re-entry error wording is not a stable ABI.

## Host integration and acceptance

Pending stride spend remains before condition sampling. Recency and combo clock
decay remain after sampling. The host stamps events, supplies pool/stat queries,
dispatches native condition procs, clears dead actors' queued events, produces
gauge sources and executes effects. The adapter must demonstrate native combat,
ward dispatch and authored stride equipment through these complete paths.

Acceptance still requires an installed-package comparison, deliberate faults,
packed consumer, full SDK verification, source guards, native game checks and
measured empty/stable/changing workloads. This contract and its baseline alone
do not establish implemented support, native-engine compatibility or performance
on Steam Deck or older mobile hardware.

## Initial implementation evidence

The first implementation and isolated game binding are recorded in
[initial-runtime.json](../evidence/milestone-thirty-seven/initial-runtime.json).
The SDK verifier passes 443 tests, 148 deliberate faults and 24 packed consumers.
Twenty-two focused tests include the 154 unchanged original sampling observations
and all fourteen predeclared recovery cases. The installed game compares 42
original courses (with only the explicit recovery decisions), passes nineteen
native callback/dead-sweep checks and detects eight installed faults. The original
seven re-entry courses remain preserved as diagnostic evidence; they are not
claimed byte-equal under the deliberate re-entry correction.

`npm run reference:conditions` reproduces the immutable original fixtures.
`npm run adapter:conditions-source` checks the guarded source transformation;
`npm run adapter:conditions` checks a freshly prepared installed candidate.
Use `-- --read-only` for comparison without injecting installed faults into a
retained control. Game, launcher and simulation types and smoke pass on the
initial isolated candidate. All 165 predecessor runtime files remain unchanged.

The separate condition entry adds 7,114 bytes of unminified JavaScript under an
8 KiB allowance. The combined bound increases from 456 to 464 KiB; every previous
entry and the core retain their existing limits. This is package-size accounting,
not measured CPU, heap or device performance. Repeated performance comparisons,
broader integration/renderer acceptance, managed-game adoption and public v0.32
publication remain pending. The example's ward callback illustrates a host
effect; the native game comparison separately exercises the actual authored proc.
