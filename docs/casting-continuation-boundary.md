# Casting continuation: original boundary

This boundary moves the orchestration in `World.updateCasting` and `World.castPress`
into an optional, instance-owned service. It composes the existing charged,
channel, guard and interactive casting capabilities. The game continues to own
input occurrence, spatial queries, actor identity, effects and presentation.

The original source remains pinned to
`88e135e6c85d301ee7c0c3641f9fc2f92be0e140` with its preserved overlay. The
[accepted observations](../baseline/milestone-thirty-five/acceptance.json) precede
any new continuation runtime. Two fresh original processes and the retained
v0.29 installation must agree on all 60 courses and 269 transitions.

## Extraction unit and ownership

The original update method has ten top-level statements spanning 695 lines. Its
retained v0.29 form has ten statements spanning 186 lines because existing SDK
modules already own most mode arithmetic. The original click method has six
statements; its retained form has five. The extraction must reuse the installed
mode helpers, preserving their state and callback contracts.

The continuation service borrows the actor's active cast and cooldown maps. It
does not introduce a second actor store, serialize per frame, queue asynchronous
events, or query content storage during updates. A host-defined aim type permits
2D or 3D integrations; identity lookup and aim copying stay explicit. No geometry
or rendering library belongs in this runtime.

In original order, each update:

1. Returns for no active cast, or lowers an interrupted guard, removes a matching
   shell, clears the active cast and emits interruption feedback.
2. Updates opted-in live aim, then follows a living clinger target for an unseated
   actor. These are separate rules with observable aim identity.
3. Computes non-primary-player hold/release decisions and channel line-of-fire
   grace from progress before the selected mode advances.
4. Rolls AI timing finesse only for eligible unseated actors and routes its click
   through the same public host click entry used by player input.
5. Advances concentration, guard, channel, charge, overcharge or the ordinary,
   perfect, timed and multitude bars through the existing mode policies.
6. Clears completed active state before delivery, stamps recovery and cooldowns
   at their original points, or invokes host placement for a totem/channel vessel.

The click operation stamps seat activity even without an active cast. A successful
timing click emits its cue before the flawless trigger. The trigger receives a
copied aim and the original skill-instance identity. Repeated clicks retain the
existing one-shot or multitude rules.

## Observed behavior that constrains refactoring

- The hold predicate distinguishes the primary player from all other actors.
  Finesse, clinger tracking and focus tracking distinguish seated from unseated
  actors instead. A real secondary seat therefore uses the non-primary charge
  hold rule but manual finesse clicks and input-controlled aim. Unifying these
  predicates would change gameplay and requires a separate decision.
- Charge release reads elapsed progress before advancing the current frame.
  Reaching the cap during one update can leave the cast held until the next.
- A successful AI timing roll does not guarantee a hit when a large frame jumps
  past its timing window. The baseline includes both a missed large-frame case
  and a click exactly at the rolled position. No hidden substeps are introduced.
- AI hold is initialized once. Completion-required and brim channels use their
  authored limits; other cases preserve the original random draw order.
- A held AI channel accumulates blocked-line time, releases at the grace boundary,
  and clears stale blocked time when its prey or firing-line condition changes.
- Guard lowering sees the original active state and shell. Shell removal only
  matches the interrupted skill. Interruption feedback sees cleared active state.
- Concentration rejects dead, downed, untargetable, invisible or missing quarry.
  Unseated actors track a living quarry; seated actors retain their input aim.
  Focus cancellation clears completed-cast recovery and still stamps the native
  cooldown using live contextual and global recovery observations.
- Ordinary completion clears the cast before effects or construction. Totem and
  channel-vessel placement inherit the base cooldown. A channel vessel receives
  the native construction parameters and is marked for a single held channel.
- Aim replacement and aim mutation are distinct. Copies occur at the original
  delivery and trigger boundaries; no generic deep clone is introduced.

Callbacks are synchronous. Host failures propagate; these methods do not promise
transactional rollback. Host ports must preserve the documented observation and
mutation order. Time units remain seconds under the existing frame contract;
this extraction does not redesign delta-time validation or scheduling.

## Evidence and acceptance limits

The observer executes native requests, updates, clicks, targeting, effects and
construction. Forwarding wrappers capture call order without replacing decisions.
Courses record random draws, live and detached cast state, aim identity,
resources, cooldowns, target validity, spawned constructs and selected effects.
Non-finite values have explicit tags.

Attributes, resources, held states, cast records and synthetic definitions are
explicit setup. Native grid geometry provides real blocked firing lines. Native
secondary seats exercise co-op authority. Diagnostic assertions distinguish a
successful setup from an empty trace. These observations do not establish every
authored combination, physical input, renderer output or device performance.

Before adopting an implementation, require independent ordering, identity,
failure and isolation tests; deliberate fault detection; a guarded adapter;
packed consumers with a 3D aim; original comparisons; relevant native/renderer
regressions; and receipt-checked measurements against retained v0.29. Keep prior
accepted source and package archives intact. Steam Deck, older mobile devices,
Unity, Godot and Unreal require their own acceptance evidence.
