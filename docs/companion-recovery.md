# Companion recovery

The optional `@hollow-wake/engine/companions/recovery` entry owns immediate
companion recovery and revival over explicit, borrowed host actors. It has no
timer, world registry, actor constructor, random stream, save owner or database.
The bonded companion controller and ordinary game dwell logic can call it.

`recover(actor)` requires a living, standing, nondormant owned companion.
Configured cleansing removes active debuffs and replaces the pending expiry
array with beneficial entries, retaining each surviving payload identity.
Unknown status definitions count as harmful. With cleansing disabled, the
existing pending array and its payloads remain untouched.

The shared protection budget counts every current, nondead, nondormant companion
with the same owner identity, including downed bodies and bodies held by other
bond skills. Host actor lists must be dense. The implementation counts without
allocating an intermediate array, then reads the current duration policy. It
ends the old configured status before applying exactly one new budget. An old
longer window cannot survive pack growth. Missing/nonpositive status durations
and nonpositive budgets still remove old protection. No effect-duration stat
amplifies the supplied window.

`revive(actor, fraction = 0.5)` requires a downed, nondead, nondormant companion.
It clears downed state and revival clocks, invokes recovery, restores life to
`max(1, maximumLife * fraction)`, then requests the presentation cue. The original
rule permits fractions above one. An ownerless body can revive; its recovery
step is a no-op. Admission of fractions and body ownership belongs to the host.

Ports are trusted synchronous operations. Exceptions retain preceding writes;
there is no rollback or implied transaction. Rules and definitions are borrowed
and read during the command. A private graph must supply private status effects
and cue services; copying an actor does not reconnect those services.

Original observations, independent contracts and actual private continuation
are distinct qualification boundaries. Full acquisition, death, dwell scheduling,
zone expiry, arbitrary character cloning and durable live acknowledgement remain
separate operations. This command introduces no per-frame cache. The eliminated
counting array alone does not establish frame-time or Steam Deck/mobile acceptance.
