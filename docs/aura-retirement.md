# Aura retirement

The optional `@hollow-wake/engine/auras/retirement` entry removes an active aura
through explicit, synchronous host services. The host supplies current actors,
skill definitions, time, stat removal, shell attacks, payload execution and ledger
settlement. The service owns no actor registry, clock, random stream or database.

`retire(bearer, skillId, quietTreeRelease = false)` preserves the original order:

1. Remove a shell installed by this aura, then release its remaining pool through
   the first matching skill on the current bar when a bash is available.
2. Remove the aura source from affected actors in current roster order and release
   its life or mana reservation, clamping that lane at zero.
3. Remove self modifiers. For a seal, retain the life lock while another distinct
   seal remains, then remove this seal's source.
4. Dispatch an authored release skill for a living bearer, using current held time,
   wounds, definition and effective level. The host executes it at the bearer's
   current location with no cooldown or repeat ownership.
5. Settle the borrowed ledger if the bearer is still alive. A payload can change
   that decision. Reread the active instance's delivery and release matching
   overdrive debt before deleting the aura row.

Quiet release suppresses shell attacks and release payloads. It still settles a
living bearer's ledger and performs source, reservation and debt cleanup. A shell
from another source, another skill's overdrive lane, and unaffected actor sources
remain intact. Missing rows perform no work; unknown release skills are silent.
The original multiplier arithmetic permits overfull life and does not clamp its
wound factor. Invalid content admission belongs to the host's content boundary.

Definitions, instances, rows and ledger objects are borrowed. Callbacks may affect
subsequent reads; the aura row remains present during callbacks and is deleted at
the end even if a callback replaced that key. A synchronous exception preserves
preceding writes and the unfinished row. This is an ordered command, not a save
transaction or an effect outbox. A detached build must supply detached actors and
effect services; copying an aura row does not produce a complete private world.

The original baseline uses authored definitions with explicitly prepared active
rows, and records shell, seal, reservation, ledger, payload and debt boundaries.
It does not prove aura activation or full death/targeting behavior. Separate actual
rebuild courses retain Death Knell contact against count-durable and ordinary
targets, plus authored death summons. Body acquisition, summon-toggle retirement,
death, private graph construction and durable live acknowledgement remain separate.

This service introduces no per-frame work or cache. Retirement cost, whole-frame
allocation and Steam Deck/mobile performance require separate measurements.
