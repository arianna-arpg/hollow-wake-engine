# Owned crafting sessions

The optional `@hollow-wake/engine/crafting/session` entry composes the existing
crafting actions, item minting, gem residence and inventory placement services.
It owns item bodies, wallet, expertise, account counters, item IDs and the random
stream together. Definitions are validated once through `ItemContent`,
`CraftingContent` and `SkillProgression` and shared across profiles.

Crafting commands share one internal implementation. The public constructor
keeps its fixed admission policy and existing v1–v4 save envelopes; a save or
player command cannot choose another codec. Four frozen saves from
`0.59.0-candidate.0` verify exact restoration and rejection of mismatched formats.
This refactor does not add a new public save format.

This is a portable JavaScript/TypeScript capability. The Godot desktop workshop
now exercises it through real native hosts and exported inventory players; see
[background saves](background-saves.md). Existing borrowed-state game adapters
remain unchanged. Repeated readers can use the optional
[versioned view](profile-views.md) while portable saves remain complete.

## Construction and commands

```ts
import {CraftingSession} from '@hollow-wake/engine/crafting/session';

const sdk = new CraftingSession({
  crafting, skills,
  memoryKinds: {rough_memory: 'rough', preformed_memory: 'preformed'},
});
const opened = sdk.command({
  op: 'open', profile: 1, seed: 17,
  state: {
    board: {w: 8, h: 6}, items: [], equipped: {}, overflow: [], essences: {},
    account: {craftLore: {}, ledger: {}, features: [], progression: true},
  },
});
const minted = sdk.command({
  op: 'mint', profile: 1, kind: 'forge',
  options: {baseId: 'ring_lapis', ilvl: 10, rarity: 'rare'},
});
const saved = sdk.command({op: 'save', profile: 1});
```

The examples' content instances are supplied explicitly; this entry does not
load the Hollow Wake catalogue. The memory map is caller-provided authored data,
validated against item bases and crafting prices. Its sorted entries are part
of the save identity, alongside the three content IDs.

Every command carries a nonnegative uint32 profile handle. `open` imports a
complete initial state and computes the next item ID above all imported items,
unless a higher `nextUid` is supplied. `restore` admits a versioned `save` under
an unused handle. `save` returns a detached save; `close` releases the profile.
The default limit is eight profiles, configurable from one to 64.
Item UIDs are profile-local. A host combining profiles in one world must namespace
their identities or explicitly remap them as part of its ownership transfer.

| Operation | Additional fields | Effect |
| --- | --- | --- |
| `mint` | `kind: 'roll' \| 'forge'`, `options` | Uses the owned random/ID streams and places the item or retains overflow |
| `options` | `uid`, `offset`, `limit` (1–128) | Paged eligible affixes, ranks, costs and crafted capacity |
| `craft` | `uid`, `affixId`, `score`, `access` | Bench affix selection and payment |
| `station-view` | `uid`, `offset`, `limit` | Paged craft options plus authored socket/reroll prices and affix restrictions |
| `socket` | `uid`, `access` | Socket chiseling and shared crafted capacity |
| `reroll` | `uid`, `index`, `score`, `access` | Oracle reroll and its original payment order |
| `salvage` | `uid`, optional `lane`, `access` | One gear item, skill, support or memory pouch |
| `salvage-bulk` | `category`, optional `rarity`/`lane`, `access` | Original category filtering and account study |
| `lock` | `uid`, `on`, `access` | Set/clear a bag or equipped item's keeper mark |
| `recover` | `uid` | Move retained overflow into the first free bag space |
| `take-overflow` | `uid` | Remove one retained item and return its detached body to the host |

`access` contains four required booleans: `salvage`, `oracle`, `bench`, `counter`.
`station-view` adds `socket: {count, cap, cost}` and
`reroll: {cost, affixes: [{index, id, name, locked, crafted}]}` to the existing
`options` response. It uses the same bounded paging (maximum 128), returns detached
data and consumes no randomness. Quotes do not authorize actions or reserve funds;
mutation commands always check current state and host-supplied access again.

These are authoritative observations supplied by the host, not client security
claims. Lanes are `break` or `sell`; categories are `item`, `skill` or `support`.
The host also owns minigame input and supplies the finite score. Existing rules
clamp scores and retain the original station, payment, protection and lore policy.

Accepted mutation replies contain `ok`, `result`, ordered `events`, `draws` and
`nextUid`. `ok: true` means the command was processed, not that the gameplay
action succeeded: station refusal, a missing item or insufficient materials may
leave it unchanged. Refusal/cue/dirty/recalculate/account-save events describe
the original action's observable effects. A reroll that cannot be paid still
consumes the original pre-payment random draws. Invalid data returns
`{ok:false, reason}` without committing. Unexpected internal failures throw.

## Ownership, continuation and failure

Each mutating command operates on a detached draft. The entire resulting state,
its future restore envelope and the reply must pass admission before the profile
is replaced. Capacity, arithmetic or identity exhaustion therefore cannot partly
spend currency, remove cargo, advance the committed random stream or reuse IDs.
This is an in-memory guarantee; callbacks, disk writes and network deliveries
never run inside this transaction.

Recovered supports keep their levels, cuts and locks. First-fit placement uses
the existing inventory policy, including optional board masks. A full bag keeps
each owed support in `overflow`; nothing is silently discarded. The host can
recover it later or explicitly take custody. The host must durably commit the
session save together with its world item/save changes. A lost response to
`take-overflow` is not a retry-safe distributed transaction.

Unlike the original World spill, the session does not generate drop positions or
visual bob phases. Hosts choose those using a separate presentation/spatial
stream. Crafting continuation therefore includes only owned gameplay randomness;
it does not promise equivalence with the original shared World RNG after spill
presentation draws. No spatial dependency is imported.

## Admission and resource bounds

Saves require matching schema, capability, content IDs and memory mapping. They
retain item placement, rolls, unique choices, gem cargo, grant cargo, memory units
and writ metadata. The validator rejects unknown fields, unknown item/skill/
support/affix IDs, invalid trees/choices, duplicate ownership, overlapping or
masked placements, and a next-ID floor that could reuse an identity. All authored
unique items minted by the existing item rules are admitted without altering
their choices or rolls.

Attunement/form IDs, support-cut strings, memory source/event identifiers, quest
and relic keys and equipment-slot names remain host-owned semantic identifiers.
Their data shapes are validated and retained; this session does not interpret
world forms, support behavior, quests, relic custody or equipment eligibility.
Account features/ledger observations are host-authorized inputs. This API is not
a cryptographic save verifier or an arbitrary content migration tool.

Limits are 512 KiB of compact UTF-8 JSON, 262,144 string code units, 32,768 visited
values and depth 16 per command/reply/restore envelope. The string budget admits
all 3,929 authored crafting-family records; the earlier 131,072-unit draft did
not. Bags have at most 4,096 cells and 256 cells on either axis. Each item list has
at most 2,048 entries, equipment 64 slots, and a cargo/socket/roll list at most
1,024 entries (memory units retain the general 2,048-entry limit). These are data
protocol limits, not total heap or device budgets.

Ordinary accessors, hidden/symbol properties, sparse/exotic arrays, cycles,
nonfinite numbers, NUL and malformed Unicode are refused before admission.
Live executable proxies are outside the JSON contract. The existing tolerant
`items/restoration` service is a separate migration boundary; this session never
silently clamps or discards saved cargo to make it fit revised content.

## Verification and remaining work

`npm run test:crafting-session-package` packs and installs the actual SDK in an
isolated offline consumer, supplies separate compiled content, checks its public
TypeScript declarations, and runs the same 14 contracts through its browser
bundle with ambient RNG and browser services disabled. The portable tests cover
payments, station gates, equipped recalculation, lore/protection, memory sale,
support overflow, exact save/random/ID continuation and late-failure rollback.
`npm run test:crafting-session-faults` checks deliberate ownership, identity,
continuation and admission faults against the installed consumer, with restored
controls. Neither check regenerates original gameplay observations.

Native/editor packaging, integration with a larger character/session owner,
renderer interaction, upstream content migration and durable host recovery remain
open. Benchmark the complete command workloads before optimizing their drafts or
claiming latency/allocation improvements. Physical Steam Deck and older mobile
measurements remain required; a passing desktop or browser test does not prove
those targets.

The exploratory Windows x64 native probe uses a previously verified native
library and the installed SDK consumer:

```text
node scripts/probe-crafting-session-native.mjs --package <package-receipt.json> --library-proof <library-pointer.json> --tools <tools-pointer.json>
```

The initial probe returned native script-error status during initialization at
32 MiB and 64 MiB heap caps. At 128 MiB it completed a short mint/save/restore
continuation course and released all tracked allocations at shutdown. It is not
an engine package acceptance test, a timing benchmark or evidence of low-end
hardware suitability. Content construction and representation costs must be
investigated before adopting the smaller cap for a crafting addon; raising the
cap does not establish the requested optimization.

[Windows evidence](../evidence/crafting-session/windows.json) retains the full
SDK checks, independent package contracts, injected faults, native diagnostics,
development corrections and original-work preservation results.

The subsequent [content-table milestone](content-tables.md) admits the full
course under a 32 MiB native cap. The [combined Godot addon](godot-crafting.md)
exercises this representation in an editor and a relocated release, including
portable disk saves and isolated account progression.
