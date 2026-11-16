# Memory-only character composition

For the matched downloadable package set and executable first run, start with
the [release adoption guide](sdk-adoption.md). The version numbers below describe
the original milestone-two candidate; use the release manifest for installation.

Milestone two provides `CharacterSession` (`@hollow-wake/engine/character/session`),
`CharacterLive` (`./character/live`) and the separately compiled
`@hollow-wake/characters` authored factory. It composes existing rules; it does
not own a game world, quest campaign, account, database or save coordinator.
The [completion plan](combat-inventory-plan.md) still assigns complete combat
family coverage to milestone three and the Node/Godot reference adapter to four.

The first candidate pairs engine `0.60.0-candidate.0`, authored builds
`0.2.0-candidate.0` and characters `0.1.0-candidate.0`. Exact peer versions
prevent an older factory from silently satisfying the new composition.

## Install and create

From an SDK checkout, run `npm ci` and `npm run reference:prepare` once, then
build the engine with `npm run build`. Produce the two content packages with
`npm run content:character-builds -- --out <new-builds-directory>` and
`npm run content:characters -- --out <new-characters-directory>`. Pack the engine
and those directories with `npm pack`, then install the three resulting archives
in a consumer. Neither content compiler overwrites an existing output directory.
These are local/GitHub archives, not packages published to the npm registry.

```js
import builds from '@hollow-wake/character-builds/builds.json' with {type:'json'};
import content from '@hollow-wake/characters/characters.json' with {type:'json'};
import {createCharacterKit} from '@hollow-wake/characters';

const kit = createCharacterKit(builds, content); // share immutable rules
const character = kit.create('magician', {seed: 71});
const award = character.authorize({kind:'points', currency:'passive', amount:2});
if (award.accepted) character.commit(award);
const build = character.inspect();
const portable = character.export();
```

`create` seeds the class's authored starting bar, attributes and point budget.
It does not create a campaign kit or claim an account. Hosts can mint items using
the existing item host and authorize their delivery. `admit(data, projection)`
validates imported character data against the same content and ownership rules.

## Prepare, inspect, publish

`prepare({kind, request}, conditions)` makes a private candidate. It returns an
opaque change with `accepted`, `changed` and, on refusal, `refusal`. Preparation
never changes owned/live state. `preview(change)` returns detached data, inputs,
derived build, permissions and ordered events. `inspect()`, `item(uid)`,
`stat(id)` and `canSocket(...)` supply build and Inventory inspection.

The host publishes at its chosen simulation boundary:

```js
const change = character.prepare(
  {kind:'inventory', request:{op:'equip', uid:17, slot:'ring1'}},
  {salvage:false, oracle:false, bench:false, counter:false, study:false},
);
if (change.accepted) character.commit(change, livePublisher);
```

`commit` without a publisher is the memory-only/theorycrafting path. It needs no
storage acknowledgement. Foreign, forged, consumed or stale proposals cannot
publish. A newer commit invalidates earlier proposals. Retaining previews never
grants permission to change the owner. A refusal discards candidate spending,
reserved item identities and random draws. A refused paid passive allocation also
discards its provisional free-root opening; `ensureOpenRoots` remains an explicit
operation. This is the owner's atomic-refusal contract, while the legacy borrowed
action retains its original partial-write behavior.

| Command kind | Operations | Trusted host conditions |
| --- | --- | --- |
| `inventory` | equip, unequip, move, place/take local container, recover overflow, craft affix, socket, reroll, salvage/bulk, lock, inlay | Station access and whether salvage teaches crafting lore |
| `bar` | bind/reorder learned or admitted equipment-granted skills | None |
| `support` | socket/unsocket learned, stored or equipment-granted investment | `hold: null` or a refusal reason; grants also identify the exact host item |
| `rack` | learn/unlearn | `meets` and per-skill `blocked` reasons |
| `skill` | level skill/support, pick/reset awakening tree, convert ability essence | `nearFont`, per-skill `memory` refusal reasons, `hold` |
| `merge` | merge copies into the requested rarity | `nearFont`; external world-drop custody is refused |
| `passive` | allocate/refund/choice, bind graft | `refundRefusal`, `openAllRealms`, `runLedger` observations (an empty object is valid) |

Existing exact request shapes and rule semantics are shared with the previously
qualified command helpers. Host conditions are separate from player requests and
portable data. They do not require installing the systems that might produce
those observations. This API is a trusted in-process boundary; a network host
must not dispatch player input into `authorize`.

`authorize` accepts direct XP, passive/Vocation points, Vocation selection,
ability essence, crafting material, realm points, vestiges, items and projection
changes. It decides no reward entitlement. Item batches contain 1–64 admitted
bodies, with distinct UIDs at or above the current `nextUid`; accepted delivery
advances that floor. Full bags retain unplaced bodies in detached overflow.
Repeated delivery with an old UID is refused. XP preparation accepts at most 32
level transitions per award; oversized/invalid arithmetic refuses before writes.
Large legitimate awards can be split by the host. Legacy progression limits are
unchanged.

## Live identities and host effects

`kit.live(frame, effects)` supplies the publisher. The frame borrows the current
actor, learned map, granted map, stat sheet and existing rebuild services.
Call `initialize(character.current())` once on a fresh host frame, then pass it
to `commit`. Do not install the private preview graph as a running actor.

Surviving learned and granted instances retain their identity. Explicit grant
investment must name the current host item. Rebinding happens before slot-based
grafts derive. Rebuilds share the extracted contribution/equipment/level fold;
casts, cooldowns, resources and unrelated temporary effects remain live.
Retired learned instances call `effects.retire`; that host hook must cancel their
invalid casts and retire owned effects. Existing equipment rebuild hooks retire
invalid granted auras/summons. Ordered `effects.event` signals let the host
resynchronize surviving support/awakening effects and fill living actors on
level-up. Frame hooks continue to own companion bodies, guard/bond synchronization
and spatial effects. The installed test host demonstrates the small contract;
the complete engine adapter remains milestone four.

All publication callbacks are synchronous, nonthrowing completion effects. The
owner prevents reentry. If a callback throws after changing external state, the
owner is quarantined and the proposal cannot be replayed. There is no pretend
rollback of host side effects: the host must discard/reconstruct that failed
frame and owner from its last accepted data. Retain that data before publication
if the host needs recovery.

## Portable data and separate authority

`CharacterData` contains character investment, cargo, wallets, crafting lore,
random continuation, UID floor, XP and durable stat-source order. Nested context
format names retain compatibility with existing validators; they do not load
workshop account services. Imports reject unknown account fields, UID collisions,
unowned bar bindings and local copies of external relics. Existing cold investment
repair still applies. Only the exact set/order of admitted durable sources can
be restored; arbitrary source modifiers and temporary live effects are excluded.

`CharacterProjection` supplies feature IDs and external Reliquary bodies, enabled
state and effective power. It is never serialized in `export()`. The host owns
those bodies and receives detached updated grant investment in each publication.
Default content's Reliquary is externally owned, so player container moves cannot
take its custody. Container geometry and local-container actions are available
through the shared definitions; default content has no local container ladder.

Reconstruct using the corresponding projection, then use an authorized projection
change to change entitlement/body ownership. An incompatible projection/source
set is refused on import. Exported character data is not a full live-combat
snapshot and does not choose a file, SQL or account architecture.

## Evidence and limits

`npm run reference:character-session` runs only the pinned original twice and
compares its bytes with `baseline/character-session`. Ordinary verification never
regenerates that baseline. The three courses are Warrior/Cleave/Warbringer,
Magician/Firebolt/Archmage and Summoner/Ruin/Gravebinder. All combine worn uniques,
support gems, Vocation/passive investment, Reliquary contributions and skill
awakening/tree investment. Their 30 observations compare owned and live builds,
stats, legal choices, preview damage and cast pricing; each also compares an
actual cast with a mid-cast equipment change and an actual confirmed damage hit,
including random draws. They complement per-family coverage; the summoner course
does not qualify every summoned creature's execution.

`npm run test:character-session` installs all three archives, physically removes
optional extension runtime/declaration modules, type-checks the public API,
bundles for a browser, runs fresh consumers and deliberate-fault controls, then
reruns restored code. Its owned temporary directories are removed in `finally`.
`--source` is development-only and does not prove physical module absence.

Content is loaded once per kit; character preparation is off the per-hit/per-frame
path. No database query or ambient RNG is introduced. The new shared composition has a separate 96 KiB raw-module allowance and a
256 KiB bundled browser allowance; moved validators remain counted with their
legacy facades under the original limits. End-to-end allocation and
latency optimization belongs to milestone five; this evidence does not qualify
Steam Deck, older phones or a native engine package.
