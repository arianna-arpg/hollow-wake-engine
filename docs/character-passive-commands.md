# Durable passive command boundary

The internal complete-character owner now prepares allocation, refund, graft
binding and open-root commands through the existing passive rules. These commands
are maintained source, but remain excluded from the installable package. They
do not establish a stable complete-character API or save format.

## Preparation and publication

`CharacterWorkshopAdmission.passive` reads investment from an admitted private
continuation. The trusted host supplies an explicit current-run ledger, the
refund-service refusal and realm-opening policy. Run progress and permanent
account progress remain separate: passive realm access follows the run ledger.
Missing or malformed run observations fail admission; there is no account fallback.
Player commands cannot supply either ledger or award currency.

The host must serialize run investment changes with preparation and publication.
This observation boundary does not yet provide durable run ownership or reward
authority. It must not be treated as a complete run save.

Preparation records every intermediate rebuild. Opening a realm's free roots
before a refused purchase is still a change that must be preserved. A successful
purchase can require both the root rebuild and the purchase rebuild. Repeating
an unchanged graft binding produces no publication token.

The complete boundary admits connected, acyclic paths of opaque continuations.
It derives profile and account identity from the owner, bounds each command's
path at 256 transitions, and retains any subsequent account normalization.
Neither the opaque continuations nor the rebuild journal enter JSON saves.
An invalid later command discards the entire private preparation.

`CharacterPassiveEffects` plays the admitted effects after acknowledgement.
It does not authorize storage, admit a character or recover a failed actor.
Its bound callbacks must finish synchronously. On failure, preceding effects
remain applied and the durable owner requires recovery.

The player captures eligible current summons before the acknowledged rebuild
and refreshes captured survivors afterward. It snapshots both current learned
and granted skill collections before refreshing supports. Equal skill IDs remain
separate visits. It never restores a preparation-time life, mana or timer snapshot.
The host's ordinary-summon refresh must preserve spawn-time geometry; batch
bodies retain the original separate refresh behavior.

Pure policy refusals currently follow the durable acknowledgement path too:
feedback is published after a storage revision even when investment is unchanged.
Avoiding that write needs a separately admitted feedback-only contract. A refused
purchase that opened free roots cannot use such a shortcut.

## Reproduction

Build the SDK first, then run:

- `node --test test/character-build-journal.test.mjs`: 19 journal cases covering
  normalization, spoofed identities, disconnected paths, bounds, rollback and
  per-command account observations.
- `npm run test:character-commands-types`: 75 rejected calls across the complete
  command surfaces, including synchronous passive publication ports.
- `npm run test:character-passive-effects`: current support enumeration, captured
  survivor behavior and two deliberately broken playback variants.
- `npm run test:character-passive-composition`: the unchanged 343-group base
  course, ten additional passive checks, 9,360 frozen original commands across
  39 classes, five deliberate faults and restored controls. It also checks all
  four combinations of run/account access, eight forged player contexts and
  eight invalid host observations against actual original decisions.
- `npm run test:character-passive-world`: 42 frozen original World transitions
  and a strict type check across the pinned game's production source.

The composed course also pairs the real original game with four delayed-save
scenarios: acknowledged investment, definite storage refusal, competing live
investment and feedback-only policy refusal. During the acknowledged refund,
combat advances, an existing summon dies and another is spawned. The comparison
checks the current survivor, geometry, resources, timers and effect order.

Two mixed courses also compare ordered account observations with passive
commands on two actual original actors. Run ledgers remain independent while
account progress changes. Six scene courses cover acknowledgement, refusal,
retired scenes, replaced bodies, lost acknowledgements and partial publication.
Cold reconnect restores passive investment without replaying purchase effects;
it does not yet restore the whole actor. See [account publication](character-account-journal.md).

The shared composition runner verifies the original base course's accepted hash
before appending the passive checks. It never regenerates expected observations.
All inputs are maintained source or frozen baselines; `.artifacts` contains only
generated output. Its temporary workspaces are removed on success and failure.

The live game bindings in `test/character-passive` are test adapters. Full actor
recovery, full canonical relic publication, investment-award authority,
installed complete-character packaging and device qualification remain open.
The checks above do not establish Unity, Godot, Unreal or physical-device support
for the complete character owner.
