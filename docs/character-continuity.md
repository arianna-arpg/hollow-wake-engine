# Class saves, rewards and companions

Version 0.42 adds four optional imports under `@hollow-wake/engine/character/`.

| Import | Responsibility |
| --- | --- |
| `account` | Create, restore and serialize discovery, pending selection, mastery picks, explicit skill grants and gem-drop pools. |
| `rewards` | Reconcile earned class bundles, transfer historical gem investments, and decide whether a skill can be selected deliberately. |
| `mercenaries` | Copy hired-character identity, scale gem levels, trim allocated passives in breadth-first order, and restore current or legacy company lists. |
| `content` | Validate and own an immutable character-continuity content pack, including the companion gem-cap and passive-budget policies. |

## Loading the authored rules

The separate `@hollow-wake/character-continuity@0.1.0` archive supplies all 39 class IDs, starter pools, 36 reward bundles, historical gem investment rows, and companion tuning. The compiler checks IDs against the separate catalogue and compares the numeric policies with the original game across 4,096 levels. All three archives can be installed locally with npm. The repository's verification artifacts contain the archives.

A Node host can load the JSON through its own file service.

```js
import fs from 'node:fs';
import {CharacterContinuityContent} from '@hollow-wake/engine/character/content';
import {
  createClassAccess, createGemPools
} from '@hollow-wake/engine/character/account';
import {reconcileClassRewards} from '@hollow-wake/engine/character/rewards';

const data = JSON.parse(fs.readFileSync(
  new URL(import.meta.resolve('@hollow-wake/character-continuity/character.json')),
  'utf8'
));
const content = new CharacterContinuityContent(data);
const pack = content.pack;
const account = {
  ...createClassAccess(pack.starterClasses),
  ...createGemPools(pack.starterSkills, pack.starterSupports),
  kitPicks: {},
  invested: {}
};
reconcileClassRewards(
  account, pack.rewards, pack.legacy.enabled,
  pack.legacy.rows, pack.legacy.target
);
```

A browser or native host supplies the same parsed JSON through its asset loader. Validate once when loading a content revision. The rules use in-memory records, sets and ordered arrays during play. Each account owns its mutable state.

## Ownership and compatibility

Saved discoveries retain retired IDs. Pending selection retains only known, discovered, nonstarter classes. Current class definitions and starter lists are explicit inputs. Missing older fields receive their original defaults. Account envelope versions and validation remain the host's responsibility.

Restored mastery dictionaries own both map levels and retain string picks, including literal property-like IDs. Serialized set lists are new arrays. The serialized mastery dictionary remains borrowed under the original synchronous serialize-then-write contract. A host retaining or asynchronously writing a snapshot should copy that dictionary.

Drop ownership and deliberate selection have separate fields. A pending class can add its skills to the drop pool. An active shared owner or an independent explicit grant can permit selection. Reward queries read the supplied live bundle list each time, preserving authoring updates.

Investment reconciliation moves positive whole historical credits to the configured destination and deletes the old entries in original order. Repeating a completed migration is idempotent. The default reader floors and clamps saved numeric credits. A host can supply its own reader. The account and investment dictionary must be ordinary mutable records during the synchronous operation. The host commits the durable save after completion.

Companion identity copies the saved opening and both attribute records. Passive trimming retains class and vocation roots without spending the ordinary point budget, then walks the selected graph in original breadth-first order. The implementation advances a queue cursor, avoiding repeated array shifts. Gem scaling accepts a precomputed ratio so a host can reuse it for the full companion.

An explicit company array, including an empty one, takes precedence over the older single-companion field. Entries without a snapshot are skipped. Actor creation, current level choice, placement, name overrides, life fraction restoration and persistence run through the host.

## Game adapter and acceptance

The adapter delegates four game files through guarded source edits and the existing transactional installer. It validates all source boundaries before writing, retains originals during installation, and protects independent editor changes during rollback.

The original reference includes 216 reward scenarios, 39 restored companion classes, 164 account access states, legacy layouts, and the Oracle class reward transaction. The Oracle course supplies completion and proximity conditions before exercising the real payout. Its baseline was captured after the private prototypes. The other three behavior baselines preceded implementation. Initial authored content preceded its compiler prototype, while legacy investment content was added in a separately recorded original-source capture.

Reproduce the package and game checks with the following commands.

```sh
npm run build
node scripts/test-character-continuity-package.mjs
node scripts/test-character-continuity-overlay.mjs
npm run adapter:prepare
node scripts/test-installed-character-continuity.mjs --location .artifacts/adapter-location.json
```

The installed fault suite compares 25 deliberately altered results with the corresponding original-game fault recordings. Companion probes exercise actual restored actors, support scaling, patron-level resynchronization, and save/resume. Existing creation, mastery, Vault activation and disk Continue checks remain part of release verification.

The class-claim settlement loop also skips already-owned entries before the duplicate-award guard. The guard still prevents repeated grants when a host fails to persist ownership. Repeatable timings and identical-build controls are recorded separately from the package contract.

Physical Steam Deck and older-mobile measurements remain pending. Unity and Unreal integrations, broader Godot coverage, class gate evaluation and mastery acquisition remain on the completion inventory.
