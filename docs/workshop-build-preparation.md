# Private builds inside account/workshop transactions

`@hollow-wake/engine/account/workshop-build` exports `WorkshopBuildPreparation`.
Supply it as the optional `preparation` field of `AccountWorkshopSession`
definitions. It connects private build derivation to the existing command,
validation, prepare/save/abort/commit path. Default owners retain their existing
behavior; this capability does not change save schemas or engine admission.

The host supplies three trusted synchronous services:

| Service | Responsibility |
| --- | --- |
| `initialize(input)` | Create a complete private build on explicit workshop open or restore. |
| `fork(source,input)` | Copy an existing private build without cold-restoring its retained skill investment. |
| `derive(candidate,input)` | Derive the complete new build and return `{uid,grantState}` item writebacks; null removes that field. |

Use `EquipmentSkillDraft` in the fork service when composing `EquipmentSkills`.
The complete authorized class, passive, equipment, container and companion
context must be compiled for the candidate. Copying an old sheet or looking up
only flat worn grants is insufficient when the build inputs changed. Immutable
definitions may be shared; mutable ownership must be copied. Services must not
mutate their source graph, retain graphs for later writes, or call live World
effects. Root identity checks catch an obvious reused source; they do not prove
arbitrary host copy code is pure or perform a general deep clone.

Inputs include the profile, phase, detached post-command inventory, complete
authoritative account save and optional command. The account includes progression,
reliquary and opaque host context, rather than only the crafting projection.
Input edits are discarded. Only the returned investment rows reach inventory;
unknown item IDs, duplicate rows and invalid investment refuse admission. The
existing crafting validator then admits the complete normalized save again.
Wallet, account, bar and item custody are outside this writeback capability.
The low-level `WorkshopBuildPort` is a trusted extension contract; use the supplied
class for these writeback restrictions.

The owner retains an opaque continuation beside the committed inventory. Its
short-lived crafting kernel can reopen without recreating that build. Commands
in a batch fork the latest private continuation; commit promotes continuations
and saves together. Failure or abort leaves the committed continuations and both
random streams intact. Save reads contain no graph or token and run no build
rules. Explicit close/restore starts a new cold build lifetime.

Any account change refreshes affected attached builds against the same new
account authority. The owner retains a shared account-record identity for this
check, not a serialized account copy per inventory. If one preparation fails,
neither the account nor any sibling inventory publishes. A command that changes
neither the inventory nor account skips derivation. Queries also skip it.

Account commands can now normalize attached inventories when this option is
enabled. Durable callers must use prepared changes and persist the complete
dependent group, including unchanged records, as described in
[prepared account changes](prepared-account-changes.md). A graph-only refresh
can list an unchanged inventory save in `writes` so its continuation participates
in the same acknowledged transaction. Its gameplay version still describes
serialized changes. Existing eight-record prepared limits apply to the group.
Do not persist just an account document and then publish its derived inventories.

Ten independent contracts compose the real equipment derivation and draft
modules with the account owner. Diagnostic grants expose continuation; they are
not authored helmet behavior or a new original-game parity baseline. They cover
batch chaining, abort, replacement investment, sibling failure, full account
context, cold restoration, invalid output, callback reentry and detached reads.
`test:workshop-build-package` repeats them through an installed archive and a
browser bundle, checks public types, detects eight deliberate faults and restores
a passing control. The existing 33 shared-account contracts remain separate.

The optional helper has a 4 KiB unminified allowance. The account owner grows
from a 22 KiB to a 25 KiB allowance for transactional build coordination; the
later [durable character context](workshop-character.md) raises that owner to
27 KiB with its own separate validator allowance. The
separate account-only browser cap remains 180 KiB; the combined equipment/build
consumer is bounded at 176 KiB. These are code-size limits, not latency or heap
measurements. There is no frame-loop work, I/O, database query or runtime dependency.

This provides save coordination for an explicit host build service. A complete
authored-content builder, equipment-granted bar admission, shared slot-preference
authority and acknowledgement-time reconciliation with live casts remain work
before broader Unity/Godot/Unreal use. The v4 learned-only book is unchanged.
No physical Steam Deck or mobile performance result is established here.
