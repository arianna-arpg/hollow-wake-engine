# Typed account relic bodies

`@hollow-wake/engine/account/relic-items` explicitly interprets the progression
session's opaque relic payload as a complete, validated `ItemInstance`. It
composes with the shared account owner and its existing prepared transactions.
It does not attach relic effects to a live actor or choose the active character.

```ts
import {AccountRelicItems} from '@hollow-wake/engine/account/relic-items';
import {AccountWorkshopSession} from '@hollow-wake/engine/account/workshops';

const relicItems = new AccountRelicItems(definitions.workshop);
const owner = new AccountWorkshopSession({...definitions, relicItems});
owner.command({op: 'open-account', account: 1, key: 'local', seed: 17,
  relicItems: true});
const view = owner.command({op: 'account-relic-items', account: 1});
```

The definitions must identify the same item, crafting, skill and memory-kind
content as the workshop. The module is passed explicitly, so consumers without
typed relics do not import its validator. Opening an account also explicitly
opts in with `relicItems: true`. Existing accounts stay in their original v1
format, even when the module is configured. No opaque legacy payload is inferred
or silently migrated. Content IDs are compatibility identities, not permission.

## Save and command contract

Typed saves use `account-workshop-account/v2`, `schemaVersion: 2`, and a
`relicItems` content identity. Their existing progression record remains
`progression-session/v1`. Restore requires configured matching support. The
complete item lives in each progression relic's `payload`; outer `uid`,
`relicKey`, dimensions and optional coordinates are checked storage indexes.
They must agree with the body and authored item dimensions. There is one owned
body, not a second independently editable inventory copy.

`AccountRelicItems.encode(state)` converts `RelicState<ItemInstance>` into the
existing progression carrier, deriving its indexes. `decode(state)` returns
detached complete bodies, preserving item and field order. Both admit bounded
plain JSON, registered relic bases, complete item rolls/choices/socket/grant
payloads, nonempty stable keys and unique unsigned 32-bit positive item IDs.
They do not validate the entire custody or storage policy by themselves.

The account owner additionally applies the existing progression validator:
known, disjoint seated/carried keys; released-key exclusion; investment bounds;
and canonical reserve storage. Invalid state is refused without repair or
publication. Input arrays are limited to 512 relics, within the existing whole
document bounds. Inactive and outside-board coordinates are retained as source
data; effect eligibility remains the container policy's responsibility.

The account command `{op:'relic-items', state}` accepts typed bodies and runs
conversion, full admission, private sibling build preparation and publication
in that order. The existing `{op:'relics', state}` carrier command remains
available, with the same typed admission when enabled. A typed update cannot
forget an already released key. This monotonic history check is an intentional
strict-owner rule; generic v1 account replacement retains its older behavior.
Hosts still authorize actions and supply coherent replacement states. This is
not an untrusted network action protocol or a legacy save recovery service.

`{op:'account-relic-items', account}` returns `{ok:true, version, state}`. It
reads committed state even while a prepared write is pending. Use
`prepared-save` and decode the candidate's progression reliquary to inspect a
pending state. All returned values are detached. Preparing/aborting does not
change the committed account, and any sibling callback failure discards every
candidate. Durable callers must acknowledge the entire prepared write group.

Typed accounts reject keyed relic copies in attached inventories' bag,
equipment and overflow, including legacy v1 inventories. Character v2 already
rejects those copies in personal containers and rejects nonempty account
containers. Numeric item IDs remain scoped to their present owners; no live
account-to-character projection or shared allocator is introduced here.

## Evidence and ordering

The [original capture](../baseline/account-relic-build/acceptance.json) contains
27 observations from the pinned original World, account and character code,
accepted only after two fresh processes produced identical bytes. It includes
canonical order, account power/enabling, hero suppression, carried/reseated
bodies, real companion spawn/refresh/retirement, guests, clients, possession,
cold account+character restoration, collisions and death tombstones.

Original `accountRelicBoard` filters canonical `account.items` in that order;
the seated-key array does not order the bodies. `RelicCustody.board` preserves
that behavior and returns references to the selected bodies in its input state.
Repeated banking of an existing stable key retains the original body. A
released key cannot be banked again. The typed package tests round-trip all
27 captured account states and compare their canonical board bodies/order.
This is account-data and custody evidence, not companion execution equivalence.

The observer also records important boundaries for the next live integration:

- Rebuild and character serialization use the home hero during possession.
- Only the local authoritative seat reads account relic power/enabling. Guests
  receive their original defaults; clients retain replicated context.
- Original migration removes a matching scope+UID legacy echo before collision
  handling, even if that forced collision is an ordinary item. A different
  scope preserves the ordinary body and renumbers the relic without changing
  its stable key. Strict admission here performs neither lossy legacy repair
  nor automatic renumbering.
- Authored relics in this capture grant companions. They are not evidence of
  a direct relic-owned ordinary skill grant or its investment writeback.

## Verification and remaining work

Run `npm run build`, `npm run test:account-relic-items-package` and
`npm run reference:account-relic-build`. The package runner installs an archive,
checks public types, executes the same contracts through a browser bundle with
ambient randomness/network/browser globals unavailable, detects deliberate
faults, restores clean controls and removes its temporary tree. Ordinary tests
never regenerate accepted observations. Full runtime/reference verification
includes these commands. [Retained qualification](../evidence/account-relic-items/README.md)
binds the source and result hashes.

The item validator has a separate 5 KiB unminified allowance. The account owner
grows from its previous 27 KiB allowance to 30 KiB for explicit v2 admission and
commands; older core/component and independent consumer limits are retained.
Unchanged ordinary inventory commands reuse already admitted account bodies.
No frame-loop work, SQL queries, background tasks or runtime dependency is
added. Code size and admission counts do not establish a device speedup.

Active-character authority, coherent UID migration, canonical grant writeback,
full authored private build construction, companion lifecycle extraction and
acknowledgement-time live reconciliation remain open. Native/Unity/Godot/Unreal
v2 account admission and Steam Deck/mobile acceptance require their own courses.
