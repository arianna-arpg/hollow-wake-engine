# Compiled immutable content tables

The optional `content/table/compiler` and `content/table` entries encode complete
plain-data definitions into a versioned table and decode them into a detached,
recursively frozen graph. Equal ordered values share storage. The authored packs,
their content identities and gameplay schemas remain authoritative. No database,
filesystem, engine globals or runtime dependency is required.

```js
// Build tools, once per content revision:
import {encodeContentTable} from '@hollow-wake/engine/content/table/compiler';
const file = JSON.stringify(encodeContentTable(authoredPack));

// Runtime loading; the compiler is not needed here:
import {decodeContentTable} from '@hollow-wake/engine/content/table';
import {ItemContent} from '@hollow-wake/engine/items';
const definitions = new ItemContent(decodeContentTable(JSON.parse(file)));
```

In TypeScript, `decodeContentTable` returns the generic `ContentValue` boundary.
Validate the decoded game schema with the capability's constructor; a transport
check alone does not establish valid items, skills or crafting definitions. The
generic reader deliberately does not claim a caller-selected schema type.

## Contract and compatibility

`content-table/v1` has four fields: `schemaVersion:1`, `capability`, `root` and
`nodes`. Nodes are postordered. `[0,value]` stores a finite JSON primitive,
`[1,...refs]` an array, `[2,keyRef,valueRef,...]` an object, and `[3]` negative
zero. References point strictly backward. The root is the final node and every
other node must be reachable. Object keys must be unique strings.

The compiler preserves numeric values, negative zero, strings, array order and
observable own-property order. It refuses unsupported values rather than silently
dropping them. The decoder returns frozen arrays and null-prototype objects;
reserved keys are ordinary own properties. Equal objects may have the same
identity, so decoded definitions are read-only values, not mutable save records.
Neither compiler nor reader retains or mutates caller objects. Ordinary getters,
hidden or symbol properties, sparse arrays, exotic prototypes, cycles, nonfinite
numbers and unsupported versions are refused. Executable Proxy traps are outside
the plain-data input contract; serialize across an untrusted executable boundary.

Limits are 262,144 nodes, 2,097,152 reference edges, 8,388,608 stored string code
units, depth 64 and 4,194,304 logically expanded values, including object keys.
They bound the representation and expansion, not a universal VM heap budget.
JSON parsing occurs before this API; hosts must also bound input byte size.

`ItemContent` preserves child sharing when detaching a frozen pack. It still
validates and owns the complete pack. An ordinary mutable input uses the existing
copy path. Mutable minted items, rolls, commands and saves retain their independent
copy semantics. This is lossless representation sharing, not quantization, content
selection, a new gameplay schema, binary zero-copy access or a save migration.

## Embedded crafting path

`adapters/embedded/crafting-session.mjs` is a native-host factory for a compiled
object containing the full `items`, `crafting` and `skills` packs. Unlike the
public non-mutating reader, this factory consumes the host's exclusively owned
parsed packet: after validation it releases the encoded rows, then releases each
decoded pack after its capability owns a detached copy. It creates two profile
slots and shares immutable definitions between them. Do not call this consuming
factory with borrowed application data.

The native proof compares the accepted 0.48 package with the installed candidate,
using the same complete content and 56 exact requests/answers. The course carries
all 3,929 crafting families and 128 items, restores a second simultaneously live
profile, checks payments, socket capacity, random and UID continuation, denied
and unpaid rerolls, masked-bag support overflow, protected cargo and both memory
types. Its loaded save is 284,147 bytes. All native hosts must return every tracked
allocation when destroyed. This is a complete tested course, not a claim that
every admissible save or profile count fits 32 MiB.

Reproduce after building and running the package checks:

```
npm run test:crafting-session-package
npm run test:content-table-package
npm run test:content-table-faults
node scripts/test-content-table-native.mjs --package <candidate-proof.json> --baseline <accepted-0.48-package-proof.json> --library-proof <verified-native-library-pointer.json> --tools <tools-pointer.json>
node scripts/benchmark-content-table.mjs --proof <native-verification.json> --tools <tools-pointer.json>
```

The native driver currently requires the pinned Windows x64 library/toolchain
and checks source, archive, content and installed runtime hashes. The predecessor
installation must match retained 0.48 evidence. Unit and packed/browser checks are
portable; the workflow schedules Windows and Linux checks. Hosted and device runs
remain separate from local acceptance. The native factory is preparation for an
engine package, not a finished Godot/Unity/Unreal editor integration.

## Measurement boundary

Retained evidence lives in `evidence/content-tables/windows.json` with the complete
raw results beside it. The timing comparison uses five alternating paired runs
at the same 128 MiB cap; separate correctness runs exercise the candidate at
32 and 64 MiB and the predecessor at 32, 64 and 128 MiB. Report initialization,
course time, retained bytes, peak tracked bytes and allocation calls together.
Smaller resident data can cost additional validation work and allocations at
load time. These are desktop native measurements, not Steam Deck or older-mobile
frame budgets, process RSS, or a universal speedup.

The design follows the existing [content-storage decision](content-storage.md):
compile shared read-only definitions outside gameplay, preserve inspectable source
data, and measure the actual host. SQLite remains useful for authoring queries;
introducing per-command SQL would not address the measured duplication here.
