# Run progression and character checkpoints

The internal run owner composes XP, earned passive/vocation points, run counters,
level investment, passive commands and the existing account/character journal.
It remains excluded from the installable
package. Its diagnostic save identities are not a stable game-save format or a
legacy-save migration.

## Ownership and execution

`RunCharacterSession` owns one complete account/character processor. The run owns
XP, stored next-level thresholds and the run milestone ledger; level and passive
points remain in character investment. Saved character/account keys are stable.
Process-local handles and active selection require explicit host bindings.
Permanent account progress never substitutes for the run ledger.

Ordinary commands cannot manufacture XP, point or run-counter grants. Trusted game code submits awards
through a separate entry, using one-use internal grants. Each command observes
preceding staged changes. Canonical relic selection, seated area and enabled
state come from the staged account; the host supplies transient eligibility,
blessing, suppression and ownership observations. Seated-area caching uses
immutable account-record identity, not the account key.

Non-leveling XP skips character reconstruction and character/account saves.
Unchanged milestone ledgers retain their immutable reference. Each award keeps
the original rounding and stored threshold: summing small awards before rounding
would change behavior. Each award permits at most 256 level rebuilds. These are
structural work reductions, not measured target-device speedups.

Earned point grants change the character wallet without rebuilding combat stats.
Later commands in the same batch can spend those points. Point grants and counter
increments accept nonnegative safe integers and reject overflow; the run ledger
admits at most 4,096 keys. Permanent account counters remain separate account
commands, so a host must explicitly include both scopes when a deed affects both.
New XP milestone keys obey the same capacity limit. A level-up that would exceed
it rejects the entire prepared batch before rebuilding investment; ordinary XP
and already-stamped milestones remain usable when the ledger is full.

The run owner's account-only normalization retains an existing private build only when its
inventory, character investment, next item ID, feature list and canonical relic
scope are identical. Counter and account-currency changes do not themselves
rebuild characters. Actual investment commands and changed build dependencies
still derive a new build. Exact comparison metadata has a memory cost; this
work-count reduction is not a measured memory or target-device performance claim.
The complete kernel requires an explicit `reuseAccountBuilds: true` host opt-in.
Its default preserves the original account-triggered character rebuild callbacks.
The run owner opts in because it publishes account changes through its separate
account journal; hosts using it must consume that journal even without a build transition.

Reused builds advance their private account association with the transaction,
without generating character storage writes or build transitions. Aborting a
batch discards that association too. Selecting the active character still follows
the established active-first rebuild and publication order for every sibling.

`ExperiencePlanEffects` preserves every intermediate investment checkpoint and
the original callback sequence. It reads current downed state after rebuilding,
before filling resources. Plans contain no life, mana, timers, actors or world
snapshots. Ledger changes publish after the callbacks. Exceptions retain effects
already applied and require the surrounding durable owner to recover.

The prepared-step adapter is outside the public account core. Its borrowed read
returns primitive metadata; read and execute expire after the command, including
failure. Legacy public construction cannot select this internal adapter.

## Optional persistence

`DurableRunOwner` composes the existing `DurableCharacterOwner` coordinator. One
compare-and-swap revision covers the run and located character group, including
account state and owed deliveries. The synchronous run owner has no database,
filesystem or automatic saving policy.

Reads retain the paired last-published run and character group while storage is
pending. Synchronous live publication completes before that readable pair advances.
Detached build inspection is limited to handles in the exact prepared journal.
Its capability expires on success, refusal and failure, including failed preparation.

Definite refusal leaves the candidate unpublished. Conflicts, uncertain commits
and failed live publication require recovery. Reopening investment must not
repeat XP, healing or announcements. Saved scene identity does not authorize
publication into a retired scene or replacement hero.

Pending submissions are rejected. Production reward sources need bounded admission
and serialization, retaining earned rewards until their outcome is known. They
must not drop an award, blindly retry an uncertain commit or treat an in-memory
queue as crash-durable. That reward protocol and full combat-actor restoration
remain separate release requirements.

Trusted checkpoint batches also accept earned points and run-counter increments.
One acknowledgement covers these grants, XP, account progress and character
investment. The coordinator does not deduplicate a repeated gameplay event:
reopening a stored checkpoint is safe, but resubmitting an uncertain reward is
not an event-recovery protocol. Complete quest settlement, owed loot, vocation
earning, reward choices and production reward admission remain separate work.

## Reproduction

After `npm run build`:

| Command | Coverage |
| --- | --- |
| `npm run test:run-character-types` | Positive contracts and 60 rejected calls |
| `npm run test:run-character-experience` | 744 frozen original transitions, 954 plans, 710 shared-ledger observations, seven extra cases, five faults |
| `npm run test:run-character-owner` | Eleven original ownership cases plus twelve earned-progression cases, four canonical relic courses comparing eighteen original factors, thirteen original checkpoint courses plus five earned-progression checkpoint courses, seventeen faults |
| `npm run test:run-character-sqlite` | Four fresh processes for both XP and earned progression: creation, lost acknowledgement, fresh-handle reconnect, competing writers, rollback and final inspection |
| `npm run test:run-character-world` | Original production types, five award courses, thirteen live checkpoint courses, seven investment reconnects, seven canonical courses, seven faults |
| `npm run test:run-character-sqlite-world` | The same twenty live checkpoint/canonical courses against SQLite files |

World courses compare intermediate builds and callback traces with the pinned
original implementation. Canonical cases include worn skill grants, a wounded
Stone Golem, and mixed XP, relic enable/disable and passive investment. Toggles
use a trusted enabled-state-only host path; arbitrary player account replacement
is not authorized. Unexpected normalization paths fail the fixture.

Controls run in fresh processes and again after deliberate faults. The runner
records source hashes and compressed logs, checks unchanged inputs, closes its
databases and removes its owned output folder even after failure. Type, XP, owner
and SQLite courses belong to `verify`; World courses belong to `reference:verify`.

SQLite here means Node's test backend. Physical power-loss recovery, native
storage, installed complete-character APIs, whole-actor restoration and Steam
Deck/mobile performance remain unqualified. No public export or runtime dependency
is added by this milestone.

The [durable final-vocation integration](quest-reward-qualification.md) composes
this owner with a quest book, privately minted Memory obligations and a saved
reward stream. It extends internal qualification without adding a public
complete-character export. General quest payouts and whole-World saves remain
separate.
