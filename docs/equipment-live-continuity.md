# Equipment investment during an active cast

The [original continuity course](../baseline/equipment-live/acceptance.json)
records 47 checkpoints across nine scenarios before expanding private workshop
candidates or native combat admission. It supplements the existing static
equipment catalogue, cold lookup, bar and save/resume courses. Those earlier
fixtures remain unchanged.

The observer starts real Firebolt casts from an authored Cindervigil grant,
advances their native continuation, edits the build, and finishes through the
original execution and projectile paths. Two scenarios use Gathered Casting
and the actual `World.applyInputs` path. Socket operations and bar binding use
their original public actions. Direct worn-map changes exercise rebuild behavior,
not equip authorization or bag transfers. Cindervigil's separate Pyroclast proc
remains enabled and its flights are recorded alongside the committed spell.

## Observed ownership

| Change during the cast | Bar and current grant | Already committed cast |
| --- | --- | --- |
| Socket or remove a support on the same host | Same instance; normalized investment writes to the host item | Observes that instance's changed sockets |
| Add another granting item while the first host remains | Same instance with the summed grant level | Observes the changed level; elapsed time, total and paid cost stay unchanged |
| Replace the first granting host | New instance restores the new item's investment and replaces the old bar reference | Keeps the former instance and its investment |
| Learn the granted skill | Learned instance takes the bar; granted investment remains separate | Keeps the granted instance |
| Remove all granting equipment | Old grant and its bar reference retire | Keeps the committed instance through completion |
| Clear the grant's bar position | Grant ownership remains off the bar | Keeps the committed instance through completion |

Rebuilds do not advance time or consume randomness in these cases. Completion
clears the active cast before delivery and launches the committed Firebolt
instance. Resources, random draws, compiled modifiers, deliveries, item saves,
learned payloads and all resulting projectiles are captured, not just a boolean
that the cast object survived. The earlier exported save is a JSON round trip;
its independence is not a claim that the raw serializer returns detached items.

Held input uses **exact instance identity**. A same-host rebuild retains the
held channel's connection to its button. A replacement with the same skill ID
does not inherit that connection; the existing channel follows its original
release behavior. A future adapter must not silently retarget the committed cast
or feed it by ID merely because a replacement occupies the same bar position.

## Publication consequences

Private save preparation cannot publish cloned skill instances indiscriminately.
For unchanged ownership, publication must reconcile durable build fields with
the current instance while preserving simulation-owned state. For changed
ownership, old in-flight references must remain valid even after the new bar
and grant map are published. Clock, resource, random and target state must come
from the live actor at acknowledgement, never from a prepare-time snapshot.

Item investment continues to use `packGrantState` and `restoreGrantState`.
Normalization must occur on the private candidate before durable records are
exported. Changes to equipment and crafting can require this work even when no
skill-book command was issued. This course does not implement that candidate
composition, authorize account preferences, or expand the current native gear
capability. It supplies executable requirements for that integration.

## Reproduction

`npm run reference:equipment-live` type-checks the observer inside the pinned
game, runs two fresh processes, and compares the complete observations with the
accepted bytes. Normal runs cannot rewrite expectations. It also runs under
`npm run reference:verify`.

Both `npm run test:equipment-skills-original` and
`npm run test:equipment-skills-composed` install the packed SDK into an isolated
game and replay this course alongside the existing equipment checks. Five
deliberate faults must fail at named behavior assertions: replacing a live
grant unnecessarily, retargeting a committed cast, omitting item writeback,
rewinding elapsed time, and feeding a replacement by skill ID. A restored
control must again match the complete frozen observations. Test consumers and
temporary observer files are removed even on failure.

This is original-game and installed-adapter evidence. It does not qualify
asynchronous storage publication, native engine packages, complete projectile
collision/damage, frame-time improvement or Steam Deck/mobile hardware.
