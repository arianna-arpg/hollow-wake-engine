# Account progression sessions and engine packages

The optional `@hollow-wake/engine/progression/session` entry composes the existing
unlock, memory, class-claim, gate, relic and storage implementations. It adds a
bounded JSON account boundary; it does not replace their rules or the original
game adapter. It is an experimental protocol, `progression-session/v1`.

Construct `ProgressionSession` with the three validated content packs. One session
shares immutable content while every profile owns account state and a Mulberry32
random stream. `command` accepts plain JSON values and returns a detached JSON
reply. Godot uses the same installed implementation through the existing native
extension; neither a Node process nor the game checkout is required at runtime.
The entry is optional and stays outside the eager core dependency graph.
The [Unity progression adapter](unity-progression.md) exposes the same account
contract through typed profile handles and opaque JSON saves.

| Command | Required fields besides `op`, `profile` | Result |
| --- | --- | --- |
| `open` | uint32 `seed`; optional complete `account` | Opens an unused handle; defaults to a blank account |
| `restore` | `save` | Validates version, all three content identities, complete account and RNG continuation before opening |
| `save` | none | `save` contains version, content identities, account and RNG |
| `observe` | `level`, `credits`, `ledger`, `roster` | Atomically replaces these authoritative host observations; preserves owned unlocks |
| `relics` | complete canonical `state` | Replaces relic custody observations, retaining opaque item payloads |
| `catalogue` | `offset`, `limit` (1–64) | Page, total count, metadata, current gate/ownership/investment and class discovery reads |
| `invest` | unlock `id`, integer `amount` | Gameplay result, actual spend, remaining credits, random draw count and optional memory receipt |
| `buy` | unlock `id` | Pays the remaining cost using the existing purchase rules; same receipt fields |
| `settle` | none | Newly earned class unlock IDs |
| `acknowledge` | unlock `id` | Activates a pending class claim once |
| `close` | none | Retires the profile; it does not write a save |

`ok: true` means a valid command executed. A valid purchase can still have
`result: false` or an investment result of zero. Input refusals have `ok: false`
and a reason. Unexpected implementation/native failures are not disguised as
ordinary refusals. A native failure requires closing/restoring the host; never
retry an operation whose response may have been lost after execution.

The host owns authorization, earned funds, event-to-ledger production, starting
grants, durable transactions and content migration. The catalogue includes hidden
metadata for presentation, not remote-client secrecy. Content IDs identify
compatibility; they do not authenticate a save. The complete account fields are
available in a blank snapshot. This account protocol is not the original game's
complete save format. Unknown account fields are refused rather than discarded.

Relic bodies contain `uid`, `relicKey`, `w`, `h`, optional `x`/`y`, and opaque
JSON `payload`. Storage pages/cells, selected/carried/released keys, rank and
investments are retained. Invalid/overlapping/noncanonical reserve placements
are refused instead of silently repaired; genuinely overflowing bodies may remain
unplaced until a new page fits them. Payloads and item identities survive that
purchase. Equipment, bag transfers and legacy custody migration remain separate
SDK services and host responsibilities.

The protocol uses nonnegative safe integers for account numbers and uint32 profile
handles/seeds and relic instance IDs. JSON is limited to depth 16, 32,768 nodes and 131,072 total string/key
code units, plus 512 KiB of canonical UTF-8 JSON for a complete command/reply.
Strings must contain well-formed Unicode without NUL. Byte accounting includes escaped
controls, numeric formatting, punctuation and surrogate pairs without allocating
another encoded copy. This leaves headroom below Godot's 1 MiB request cap.
Sets/ledgers are limited to 2,048 entries, item bodies to 512, roster to
128, and identifiers to 256 code units. The core defaults to eight profiles and
allows an explicit limit up to 64; the Godot wrapper uses eight. Godot decodes JSON
numbers as floats; its wrapper requests full precision when encoding. Tests cover
the exact safe-integer endpoint and reject the next integer.

Account mutations run on detached drafts, validate the reply and resulting save
before committing account and RNG together. Save capacity is
checked inside the complete restore-command envelope so an admitted state can
round-trip through the actual transport. This has a deliberate copying cost on the
account/UI path. It prevents quota/continuation failures from partly spending
currency or advancing randomness. Content is never cloned per command; existing
live inventory/combat APIs retain their separate borrowed-state contracts. Do not
call this control interface every simulation frame. Optimize it from measured
account workloads, not by removing atomicity or adding a database query to each
purchase. A database remains an optional authoring/persistence host, while runtime
rules operate on validated in-memory state.

## Reproduction

```text
npm run verify
node scripts/build-godot-progression.mjs --base <verified-addon-directory> --library-proof <matching-library-proof> --tools <tools.json>
node scripts/test-progression-session-faults.mjs --package <package.json>
node scripts/test-godot-progression.mjs --package <package.json> --tools <tools.json>
node scripts/benchmark-progression-session.mjs --package <package.json>
```

The builder checks the existing base addon, compiled C implementation, allocator,
upstream pin and matching library receipt before extending the archive. Every
base member is preserved byte for byte. A separate installed consumer runs the
session contracts and strict types. The neutral bundle must contain only the
adapter entry and installed SDK modules; asset and module budgets are explicit.
The archive tests exercise both the existing ward package and progression, plus
path traversal, duplicate members, symlinks, changed digests and overwrite refusal.

The Godot course tests real editor execution and a relocated release with the
source project/export directory made unavailable. It covers two native hosts,
partial purchases, earned/acknowledged classes, opaque storage payloads and
overflow, power investment, disk saves, ten random reward continuations, profile
isolation/capacity, invalid inputs, safe integers, catalogue paging and disposal.
Payload courses of 129,000–131,050 characters also require that every admitted profile
can save and restore, and that quota refusals occupy no profile handle.
Four deliberately broken installed implementations must fail independent tests:
reset RNG on restore, lose partial investment, skip storage reconciliation and
retain an acknowledged claim. Normal tests never regenerate original goldens.

The initial Godot observer compared integer-valued host dictionaries directly to
float-valued JSON dictionaries. Its retained failure was repaired by normalizing
only the expected JSON representation and adding independent payload/identity
checks. This did not change gameplay or saved values. The first full SDK verifier
also counted the new optional module against the historical eager-core allowance;
separate accounting now preserves every old budget and gives the new module its
own 20 KiB unminified allowance. The eager graph check independently enforces
that separation.

Archive controls also exposed Windows ZIP separator normalization. The installer
now checks raw member spelling before accepting normalized paths and rejects
case-colliding names, drive/stream syntax and truncated names. A disposable
Windows control with the raw-spelling guard removed fails the malformed-member
test, while both supported addon layouts still assemble/install unchanged.

Final review found two response-boundary defects in the first session draft:
an oversized earned-class reply could fail after committing its grant, and a
near-limit profile could fit a bare snapshot but fail inside the save/restore
envelope. Both new tests failed against that draft before the fixes. Reply
validation now precedes mutation commit, and snapshot validation reserves the
complete restore envelope. These are new adapter-boundary repairs; original
gameplay goldens and purchase arithmetic remain unchanged.

A further regression check caught that node/string-count limits alone permit
oversized encoded packets (for example, large numeric arrays or escaped controls).
The transport byte limit now rejects those inputs before admission, while valid
Unicode and smaller numeric payloads still round-trip. Ill-formed Unicode is
refused at the portable boundary instead of relying on different host decoders.

The Godot course also exposed its encoder leaving certain C0 controls literal
and its importer replacing NUL. The wrapper now escapes raw controls in compact
JSON, and the portable profile contract excludes NUL. Encode NUL-bearing binary
or text payloads in the host before importing them. Positive control/Unicode
round trips and safe-integer save/restore are checked in the real engine.

The account benchmark uses four fresh sequential Node processes, 128 warmup
cycles and sixteen batches of 128 cycles per process. Each cycle includes eleven
JSON commands: restoring a starting profile, partial/full feature purchases,
storage and power purchases, a memory reward, a snapshot, restoration under a
second handle, another reward and both closes. Independent currency, item and RNG
checks stay inside the timed cycle. Content construction is outside timing. Run
it with other heavy work stopped; it does not measure Godot call overhead or
establish an improvement against an earlier implementation.

Accepted evidence belongs in `evidence/progression-session`. Tracked embedded
allocation is not total process memory. This milestone does not establish mobile,
ARM, Steam Deck, Unity/Unreal or complete Godot gameplay support. Engine-specific
durable save orchestration, other capability facades and physical-device profiling
remain separate acceptance work.
