# Persistent native session experiment

The optional Windows x64 development host now retains SDK objects across native
calls. Its C driver loads one QuickJS context and one bundle, creates shared
immutable `Content`, `ItemContent` and `PassivePolicy` objects, then submits a
sequence of independently parsed requests. Each response is serialized and
released before the next request. Gameplay rules remain in the existing SDK.

Each logical session owns its `Engine` and random stream, character, configured
skill, plain target, item RNG/identity sequence, passive build, inventory,
ordinary casting runtime and strongest-wins timed damage. Sharing definitions
does not share these mutable objects. The caller supplies character selections,
point budgets, initial resources and target specifications; this experiment does
not establish account authority or derive a complete actor from all game systems.

This is an experiment in ownership and calling semantics. The JSON request
protocol is not a selected per-frame wire format or a stable native ABI. The C
driver is an executable test consumer; no reusable dynamic-library API, C# binding
or Unity/Godot/Unreal package is delivered by this check.

## Protocol and failure behavior

Version 1 provides create, batch, snapshot, restore and destroy operations. Handles
are monotonically assigned positive safe integers, never recycled within a
controller. Destroyed handles fail explicitly. At most eight sessions may be live;
a batch contains at most 64 commands. The C driver additionally bounds file size,
request length, request count, requested VM allocation and the VM stack.

The whole batch envelope is checked before execution. Unknown operations/fields
and invalid protocol numbers reject the batch without consuming state. SDK-level
decisions still use the SDK's validation and refusal rules. Commands then execute
in order. Ordinary refusals remain results. An exception after execution begins
retains earlier effects and marks that session unusable; the reply contains the
completed prefix. Further snapshots and operations reject it, but destruction
remains available. Recovery requires a new session restored from a known checkpoint.
Other sessions remain usable. An unhandled VM exception or malformed JSON stops
the C driver and disposes the entire context; it does not continue after an
uncertain host failure.

The exercised commands cover resolved hits, item rolls, equipment changes,
passive allocation/refund, ordinary cast press/advance, timed damage, forging into
a four-by-four inventory and moving its entries. Inventory footprints come from
the authored item bases. A failed insertion still returns its newly forged item;
the caller owns further delivery. Cast advancement returns the SDK event and does
not automatically resolve a hit. The example advances the cast before timed
damage and applies that damage to the plain target. These are explicit example
host responsibilities, not a replacement for the game's whole World update.

Snapshots compose the existing component snapshots and bind their three content
identifiers to this protocol version. All components are constructed and validated
before a restored session receives a handle. Snapshots detach their mutable data.
Content identifiers are not cryptographic identity; a real package loader must
also bind its content revision/hashes. This experiment's source and content hashes
are recorded in its verification receipt. The snapshot is not a complete game
save, authorization record or implementation of inventory-item migrations.

## Evidence and reproduction

The scenario compares original Node modules, their self-contained bundle in a
separate Node context, and repeated C-to-JavaScript calls in QuickJS. It also
checks the substantive first batch against independently orchestrated direct SDK
calls, including character construction through equip/allocation actions. This
guards against a bridge mistake that both JavaScript engines would otherwise share.

The cases cover batching versus individual calls, session isolation, save/restore
with an active cast and timed effect, random continuation, snapshot detachment,
authored inventory dimensions, atomic envelope rejection, invalid restore,
partial failure, capacity and stale handles. Malformed JSON after a successful
request, an oversized request and a content-initialization failure must stop at
the correct boundary and release all tracked VM allocations. These checks compose already extracted capabilities;
they do not replace original-game equivalence tests or execute every content row.

The [Windows receipt](../evidence/embedded-js/windows-persistent-session.json)
records 60 requests with all 609 numeric observations matching exactly, alongside
identical structure, strings and ordering. Normal execution and all three native
failure cases finish with zero tracked live VM allocations. The previous 21-cycle
host suite also passes after the shared-helper refactor. Full SDK verification
passes with 850 tests and all 201 production runtime outputs unchanged. Raw
requests, observations, error logs and the SDK verification log accompany the
receipt as lossless compressed evidence.

Use the same build/reference preparation and pinned QuickJS source described in
[the embedded-host experiment](embedded-runtime-experiment.md), then run:

```sh
node scripts/test-embedded-session.mjs --amalgam-dir /path/to/extracted/sources
```

Each run retains the request stream, three observation streams, build/error logs,
source/content hashes and verification receipt. The hosted Windows workflow runs
both this check and the earlier 21-cycle host checks. Shared allocator and cleanup
helpers are reused by the two C drivers; refactoring them requires rerunning both.
Tracked requested bytes exclude allocator metadata and memory outside the VM.
No execution-time, frame-allocation or physical-device result is established here.

The next integration work is a reusable native boundary with explicit buffer and
thread ownership, independent native-language consumers, unload/reload behavior,
and measured initialization, state-transfer and batched-call costs. Compare
equivalent embedded and native candidates before choosing the runtime architecture.
