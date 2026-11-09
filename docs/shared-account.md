# Shared account and character workshops

The optional `@hollow-wake/engine/account/workshops` entry adds one account
authority with multiple attached character inventories. It composes the existing
progression and crafting rules. It does not replace either standalone session.

An optional [private build preparation service](workshop-build-preparation.md)
normalizes item investment before candidate saves are exported and carries build
continuity through command batches. When enabled, account changes can also
normalize attached inventories; durable callers must save the complete group.

The account owns credits, unlocks, ledger counters, crafting expertise, its reward
random stream and opaque host fields. Each character owns its bag, equipment,
materials, item IDs and workshop random stream. A workshop reads current account
features and expertise on every command; its save contains a stable account key,
not a second copy of those fields.

This portable boundary is included in the [Unity shared-account preview](unity-shared-account.md).
Its typed owner and optional durable coordinator use one shared account rather
than independently saved projections. Other engine bindings and authoritative
legacy-account migration remain separate. The [shared equipment candidate](shared-account-equipment.md)
extends that coordinator with selected live combat projections; it is unpublished.

## Commands

Construct `AccountWorkshopSession({progression,workshop,rack?,equipment?}, limits?)`
with the same validated content inputs used by the existing sessions. Content is
compiled once per owner. Defaults are eight accounts and 32 workshops, configurable
to at most 64 accounts and 256 workshops.

All commands and replies are ordinary bounded JSON. Handles are unsigned 32-bit
integers. Account keys are unique within an owner and survive save/restore.
Omitting the initial account state uses the existing progression session's empty
profile. Hosts supply authored starting classes, skills and other initial grants;
this boundary does not reconstruct the original game's account factory.

| Operation | Input beyond op | Result |
| --- | --- | --- |
| open-account | account,key,seed,state?,craftLore?,extra? | New account; state is the existing progression account body |
| restore-account | account,save | Restored account and reward stream |
| open-workshop | profile,account,seed,state,progression?,nextUid? | Character attached to an open account; state excludes account |
| restore-workshop | profile,account,save | Character restored only when its saved key matches the open account |
| account | account,command | Existing progression command without profile |
| workshop | profile,command | Existing crafting command without profile |
| account-save | account | Complete account-workshop-account/v1 save |
| workshop-save | profile | Complete account-workshop-inventory/v1 save |
| workshop-equipment-text | profile | Committed worn-item map as exact JSON text; additive development API |
| prepared-workshop-equipment-text | profile,token | Worn-item map from a live prepared change; additive development API |
| close-workshop | profile | Retire the character inventory |
| close-account | account | Retire the account; refuses while workshops remain attached |

Account commands allow buy, invest, acknowledge, observe, relics, settle and
catalogue. Nested session lifecycle commands are refused. Workshop commands
cannot grant account features or change the character's progression context.
A sealed character may use existing account knowledge and purchased capacity
but cannot teach the account through salvage.

Successful delegated replies include reply, owner version and changed.
Workshop replies additionally report accountVersion and accountChanged.
Versions describe changes during the current open lifetime; they are neither
durable storage revisions nor globally unique view tokens. A processed refusal
such as insufficient craft capacity remains ok:true with its original refusal
event. Inspect the nested result/events rather than treating transport success
as a purchase or mutation.

## Transactions and persistence

Each command runs against private candidates. Validation, serialization admission
and callbacks finish before either canonical owner changes. Invalid input or
continuation overflow preserves both owners and both random streams. Account
growth is also checked against every attached inventory's combined kernel
envelope, so a successful purchase cannot strand another character at an input
limit. This bounded check scales with attached inventories and their payloads.

JSON limits are the existing session limits: 512 KiB encoded input, 262,144
characters, 32,768 nodes and depth 16. Wrapper depth counts toward these limits.
An account and inventory that each fit separately may still fail their combined
kernel envelope. Oversized proposals refuse before publication. These are data
admission limits, not measured total memory budgets.

The host authorizes account access, station observations, earned counters and
character context. Observe replaces the complete observed ledger, credits,
level and roster; provide a coherent current observation. It is not an additive
event collector. The opaque extra field is preserved but never interpreted as
mechanical account state.

For durable play, use the owner's [prepared changes](prepared-account-changes.md)
and atomically guard the complete dependent account/inventory group using
storage revision checks, including unchanged records. Only after acknowledgement
publish the candidate view and deliver its cues. Grouped storage provides the
transaction primitive; this module performs no disk access and cannot turn its
in-memory publication into a durable commit. Restoring a same-key but stale pair
does not detect a lost update: coherent reads and revision checks remain required.

No automatic migration from two independently saved legacy accounts is provided.
Such a migration must identify the authoritative ledger, features and expertise;
silently merging, summing counters or choosing the newest timestamp is unsafe.

## Original behavior and baseline correction

The first source-only capture was made before this implementation. It recorded
10 scenarios, 30 steps and nine detected deliberate faults, but the observer
seeded craftedSockets:1 on a Lapis Ring, whose socket capacity is zero. The
original runtime tolerated that artificial input; the owned SDK correctly refused
it. That capture and its observer remain unchanged under
baseline/shared-account.

Revision 2, under baseline/shared-account/admitted-socket, replaces only the
craft target with a socket-capable armor helmet and asserts the original factory
actually made its socket. It was captured after implementation began and says so.
The same original rules, source lock, scenarios and nine faults are replayed.
Normal checks verify accepted bytes; they never regenerate either baseline.

The portable course compares complete original account/inventory states before
and after every step, purchase results, catalogue ownership/visibility, capacity,
both draw counts and the account-save payload. Save/recalculation/refusal order
is compared. The original essence presentation helper emits an extra idempotent
dirty notification; this boundary compares the final dirty notification and
does not claim identical presentation text or intermediate invalidation counts.
The Oracle offer requires its actual rescue gate; an obsolete source comment
about a craft-count gate is not treated as behavior.

Run `node --test test/shared-account.test.mjs` after building, then
`npm run test:account-workshops-package` for an installed package, a browser
bundle without ambient RNG/host globals, declaration use and deliberate faults.
`npm run reference:shared-account` reproduces both source revisions.

This module is for inventory/account commands, not a per-frame combat loop.
The initial correctness boundary deliberately reuses the existing rule kernels.
Call overhead and physical Steam Deck/mobile performance remain unmeasured for
this composition. The native memory findings below are exploratory.

An earlier exploratory run against the exact public Unity progression 0.4 native
library found a 32 MiB failure during a catalogue query after repeated account
lifetimes: native script-error status 4, a poisoned host, and 86,410 tracked bytes
remaining after destruction (status 11). The peak was 33,493,285 bytes against a
33,554,432-byte cap. At 48 MiB, all 579 commands matched and destruction reached
zero; peak requested allocation was 36,140,101 bytes. This is a memory-pressure
and cleanup investigation, not accepted native qualification or a timing result.
The exception is out of memory. A private rebuild traced the retained allocation
to the pinned QuickJS-NG 0.17.0 string conversion failure path: it acquires a
temporary string reference but does not release it when the UTF-8 allocation
fails. The [versioned cleanup candidate](../experiments/embedded-js/patches/README.md)
restores zero-byte destruction at 32 MiB and preserves all 579 replies at 48 MiB.
Its focused Windows comparison passes 210 byte, retry and cleanup cases; the
unchanged runtime retains allocations in 24 cases. The repair and explicit
startup collection are now included in the qualified Unity shared-account
preview; see its [pinned evidence](../evidence/unity-shared-account/README.md).
That later qualification does not change the failed historical observation.
Cleanup correctness alone is not evidence that a workload fits a smaller heap.

Reproduce with `node scripts/probe-shared-account-native.mjs --package <public-gameplay-0.4-archive> --python <python.exe> --output <fresh-report.json>`
after building. The report preserves failed limits as failed, and the scratch
directory is removed on success or failure. This command intentionally probes
the older 0.4 runtime, not the current shared-account package.
