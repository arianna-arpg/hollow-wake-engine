# Durable character builds

`@hollow-wake/engine/character/builds` composes the extracted stat, passive,
equipment, container and companion rules into private durable character builds.
The optional `@hollow-wake/character-builds` content package supplies the complete
default wiring and authored definitions. Consumers do not load the original game.

This capability constructs investment and derived build data. It does not own a
running actor, simulate combat, admit arbitrary saves or commit account changes.
The workshop owner must still integrate granted bar admission, account preferences,
the trusted adoption entry point and acknowledgement-time live effects.

## Package use

After `npm run build` and the repository's `npm run reference:prepare`, run:

```sh
npm run content:character-builds -- --out <new-package-directory>
```

Pack that directory and install it with the matching `@hollow-wake/engine`
archive. Load its exported `builds.json` through the host's normal asset loader;
then create one rules service per content revision:

```js
import {createCharacterBuilds} from '@hollow-wake/character-builds';

const builds = createCharacterBuilds(authoredPack);
const first = builds.open(admittedCharacter, savedBarIds);
const prepared = builds.rebuild(first, admittedChangedCharacter);
const display = builds.read(prepared);
const investment = builds.investment(prepared);
```

The input carries class, level, base attributes, ordered passive allocations and
choices, graft bindings, learned investment, worn items, personal containers and
the explicitly authorized account relic projection. Account features, relic
enabled state and relic power are explicit inputs. The service never reads a
process-wide account or content registry. The factory's renderer-free original
support helpers are compiled from hash-checked source; the consumer receives no
source evaluator or mutable registration API.

Definition packs are trusted compiler output. Character, item, skill and account
inputs must already pass their respective admission and authority boundaries.
This composition checks its handles, binding ownership and edit targets; it is
not a second general-purpose save validator. In particular, it does not prove
that a caller owns a relic or may spend a passive point.

## Cold restoration and continuation

`open` restores a cold build. It applies the original learned/granted restoration
policy, resolves saved bar ownership and preserves the original source insertion
order. Unknown or duplicate bar bindings fail.

`adopt(input, bar, observations)` seeds a private durable build from trusted
observations of an existing character. It preserves learned and granted investment
that a cold load would trim after a level decrease. Observations contain:

- `sourceOrder`: the current ordered durable stat-source identifiers, excluding
  temporary combat sources. Required base sources and the final derived order
  must match; duplicates and unknown sources fail.
- `grants`: every current ordinary grant's skill ID, expected host UID where
  applicable, observed level, and socket/tree investment. Derivation must retain
  exactly these granting identities and levels. A mismatched socket count fails
  instead of truncating observed investment.
- `companions`: the current companion skill IDs and observed levels. The complete
  declaration set must match the admitted character and selected relic inputs.

These observations are host-owned data, not a save format, ownership permission,
or proof that spending was legal. The host must observe one coherent character
state and supply its fully admitted inputs. The service rejects stale source,
grant and companion declarations; it never borrows the live actor or its skills.
Each adoption establishes new private lineage tokens. Subsequent `rebuild` calls
preserve those tokens while the corresponding investment remains owned.

`rebuild` copies the preceding private investment graph. Existing grants retain
investment when their derived level decreases; a different granting host restores
a new instance. Removing and later re-equipping the same item UID also creates a
new instance. `lineages` exposes detached maps of opaque identity tokens so an
adapter can distinguish these cases without retaining a full command history.
Tokens are meaningful only within the owning service and are not serialized.

Learned rows carry `{gem, locked?}`, preserving the residence lock beside the
gem payload, as workshop saves do. They are authoritative durable input. An existing learned instance
receives admitted investment without cold budget repair. Grant investment changes
must be explicit in `edits.grants`, including the expected host UID. An edit fails
if that grant is absent, repeated, removed or replaced in the resulting build.
`edits.bar` requests a complete binding after derivation; unresolved IDs fail and
slot grafts are recomputed at their new positions.

`edits.replaceLearned` names an admitted new acquisition that replaces an existing
learned skill of the same ID. It performs cold restoration, creates a new lineage,
and preserves that skill's bar position if it was bound. Off-bar replacements
stay off-bar. The ID must occur in both the preceding learned ownership and the
new input; duplicates, removed skills and grant-only identities fail. Ordinary
warm edits continue to preserve the existing learned lineage and investment.

`canSocket(build, skillId, supportId, rolled?)` checks compatibility against the
owned learned or granted instance, including rolled support choices. It returns
false for absent skills/supports and rejects foreign build handles. The authored
factory supplies the original support/crew rules. Custom factories must provide
the optional `socketFits` port to use this query; a missing port fails explicitly.
The query does not spend currency, transfer a support or authorize either action.

Every candidate owns its mutable skills, items and companion declarations.
Immutable definitions and stat modifier rows may be shared. Companion declarations
have no body, respawn timer continuation or live effect callback. A failed candidate
is discarded without changing its predecessor. Reads and investment writeback
are detached; mutating a read cannot change the retained build.

`investment` includes normalized learned payloads and item-resident grant state
from worn and active container hosts. A relic key is an address, not authorization:
canonical writes must go through the selected account owner. The existing
`WorkshopBuildPreparation` bridge still needs complete default-provider integration.

Never assign a private bar to a live actor. Live acknowledgement must reconcile
investment with current live identities and run the original retirement/refresh
ordering while preserving current casts, resources, cooldowns, time and randomness.
Use `adopt` for an already running character with retained over-budget investment;
do not use cold restoration as a substitute. The installed original-game course
checks adoption during a paid cast and verifies that the same live skill later
launches its projectile. This proves adoption does not disturb that cast; it does
not implement acknowledgement-time reconciliation. Arbitrary temporary grant-level
extensions need an explicit dependency contract before they can use this
durable-only projection.

## Verification and size

- `test:character-builds-package`: 28 ownership/failure contracts in installed and
  browser-targeted consumers, sixteen negative type cases, twenty deliberate
  runtime faults, restored controls and a standalone authored-factory check with
  hostile ambient APIs.
- A separate installed Node GC course proves preceding skill instances are
  collectible while the latest build remains readable and can rebuild. It runs
  in two fresh processes for each of cold opening and adoption, and detects
  deliberate retention of draft callbacks in both paths;
  this is a reference-lifetime check, not a heap or device budget measurement.
- `reference:character-builds`: three original-only courses, each repeated in two
  fresh processes. Normal checks compare frozen bytes and never rewrite fixtures.
- The installed authored factory matches 98 original observations in two fresh
  processes: 15 grant/relic/investment observations plus all 39 class starter
  builds and their level-18 rebuilds, and five running-character adoption
  observations. Eighteen installed adoption checks also preserve an actual paid
  cast, validate stale observations and exercise canonical companion declarations.
  The original-only exports import no SDK.

The default factory module is about 71 KB; its complete browser bundle with the
needed SDK services is about 153 KB. The uncompressed authored JSON is about
8.37 MB, mostly the existing item definitions. These are artifact sizes, not heap
or startup measurements. The package is separately loaded and does not become an
eager combat dependency. No physical Steam Deck/mobile performance claim is made.
An exhaustive support/tree mutation matrix, live workshop acknowledgement and
Unity/Godot/Unreal exposure remain additional qualification work.
