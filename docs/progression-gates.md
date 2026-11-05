# Progression gates

Version 0.43 exposes account requirement checks, labels, progress fractions and milestone derivation through `@hollow-wake/engine/progression/gates`. The optional `@hollow-wake/engine/progression/gate-content` entry loads validated authored definitions. Both entries are independent of the core import graph and have zero production dependencies.

## Content and use

The separate `@hollow-wake/progression-gates@0.1.0` archive contains the game's 88 authored `reqAnyOf` groups, 39 class display names and ledger-key templates. Its manifest records a content identity and a byte digest. The compiler verifies the frozen source key samples, class references, static unlock references, labels and milestone lists.

Brandt's rare-wares feature is authored in the pinned `src/data/brandt.ts` outside the central `FEATURE` registry. The compiler explicitly retains this host-granted feature.

Load the JSON once through your application's asset loader, then construct the content instance.

```ts
import { ProgressionGateContent } from '@hollow-wake/engine/progression/gate-content';
import { gateMet, gateRowProgress, gateRowLabel } from '@hollow-wake/engine/progression/gates';

const content = new ProgressionGateContent(pack);
const requirement = content.requirement('class_spellblade');

const held = gateMet(
  account, requirement.rows, requirement.mode, ownsUnlock, content.context,
);
const rows = requirement.rows.map(row => ({
  progress: gateRowProgress(account, row, ownsUnlock, content.context),
  label: gateRowLabel(row, content.context),
}));
```

Here `account` supplies a numeric ledger and a feature-membership service. `ownsUnlock(id)` reads current host ownership. Queries observe changes made between calls, including synchronous changes made inside ownership callbacks. The content instance owns a detached, recursively frozen pack and builds its class-name and requirement indexes once. Unknown requirement IDs throw.

Hosts retain visibility and reveal policies, other static eligibility rules, mastery purchasing, rewards, ledger stamping, persistence and presentation. These requirement groups can participate in each host policy.

## Query contract

- Row membership follows the original priority for mixed legacy rows. Ledger, prefix, unlock, feature, level, per-class level, vocation and quest are considered in that order.
- A prefix check succeeds when an individual matching counter meets the threshold. Enumerable inherited ledger entries retain the original behavior.
- Missing and empty gate lists are open in either composition mode. Nonempty sparse lists follow JavaScript `some` and `every` semantics.
- Ownership callbacks remain lazy, ordered and short-circuiting. Array iteration retains the initial length.
- Any-quest requirements honor the historical lifetime completion counter as well as individual quest records.
- Level progress reads the highest integer milestone at or below the target. Numeric conversion preserves the original handling of whitespace and exponent-form suffixes.
- Level derivation preserves duplicates and order. Per-class derivation returns a new array containing borrowed target records, exposed as read-only fields.
- Custom key encoders receive their context as the method receiver. Level encoders append a numeric suffix after a stable prefix, and encoding zero ends in one zero digit.
- Labels use current names from a caller-supplied context. The content-backed context uses its immutable name index.

The low-level query API preserves recorded numeric edge cases, including nonfinite inputs. Content authoring validates finite serialized numbers, positive integer level targets, field types, unique IDs and unambiguous row kinds. Empty rows and signed fractional count thresholds remain valid. Historical class IDs and host-provided ownership IDs are supported.

## Game installation

`adapters/hollow-wake/integrate-progression-gates.mjs` delegates the original `src/meta/gates.ts` entry points. It checks reviewed function fingerprints, preserves surrounding source and uses the shared transactional installer. Imported key functions are resolved lazily across the game's account/unlock module cycle. Class labels retain live lookup in the game's class registry.

The adapter keeps the original private milestone helper when unrelated local code references it. Installation rejects reviewed-function changes, binding collisions, a concurrent installer or a concurrent source edit. Repeat installation is explicit and fails before another edit.

## Verification

The frozen gate fixture precedes the runtime prototype. The key/content supplement was captured afterward and before its content compiler. Both capture times and scope are recorded in `baseline/progression-gates/acceptance.json`.

Run the focused checks after preparing the pinned reference.

```sh
npm run build
node scripts/test-reference-progression-gates.mjs
node scripts/test-progression-gate-source-faults.mjs
node scripts/test-progression-gate-overlay.mjs
node scripts/test-progression-gate-package.mjs
npm run adapter:prepare
node scripts/test-installed-progression-gates.mjs --location .artifacts/adapter-location.json
```

The clean consumer exercises the actual packed SDK and content archive against the original observer body, through its own account records. Deliberate installed faults must reproduce the same incorrect observations as the corresponding original-game faults. Wider acceptance includes the character screen, Vault save/Continue, previous character rules, game type checks, simulation smoke and the full SDK verification suite.

The two optional JavaScript modules have a combined 12 KiB unminified growth budget. Existing component budgets remain enforced separately. Device CPU, memory and frame-time acceptance remains part of the Steam Deck and older-mobile validation work.
