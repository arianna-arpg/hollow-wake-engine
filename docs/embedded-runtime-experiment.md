# Embedded JavaScript compatibility experiment

An optional development check runs the existing SDK in QuickJS-NG 0.17.0. It tests
a route for retaining one gameplay implementation behind native engine adapters.
It does not select the final runtime or deliver a Unity, Godot or Unreal package.

The same observation code runs against the original SDK modules in Node, a
self-contained bundle in Node, and that bundle in the pinned QuickJS CLI. The
bundle must have no external imports. The CLI wrappers handle test-file loading;
the gameplay code has no Node or QuickJS-specific imports. Ambient randomness,
network access and browser globals throw if a gameplay operation accesses them.

The workload loads the complete compiled item and passive-policy packs: 79 bases,
3,929 affixes, 2,489 passive nodes and 39 classes. It exercises 256 seeded item
rolls and modifier compilation, 16 save/restore continuation rolls, forging and
inventory restoration, and allocation/refund/restore around every class start.
The existing selected character path contributes equipment, an attribute/passive
build, a configured skill with supports and 32 resolved combat contacts. Loading
all definitions does not imply executing every definition or gameplay capability.

Node's bundled and original observations must match. Cross-runtime comparisons
require identical structure, strings, discrete results and ordering, with the
existing `1e-12` absolute/relative numeric tolerance. Exact numeric matches are
also counted. JSON text hashes can differ despite equal parsed numbers; this is
not a network lockstep guarantee. Original-game fixtures are not regenerated.

The first [Windows x64 receipt](../evidence/embedded-js/windows-compatibility.json)
passes all three executions, including 277 accepted passive actions. All 5,153
compared numbers match exactly. The raw observations are retained as lossless
gzip files alongside their compressed and original hashes. This establishes
compatibility only for these exercised paths; it measures no runtime cost.

## Reproduce

Build the SDK and install the existing locked development tools:

```sh
npm ci
npm run build
npm run reference:prepare
npm run reference:install
node scripts/test-embedded-js.mjs --qjs /path/to/qjs
```

Use the matching asset from the official [0.17.0 release](https://github.com/quickjs-ng/quickjs/releases/tag/v0.17.0).
The [runtime lock](../experiments/embedded-js/runtime-lock.json) checks its published
SHA-256 before execution. The binary is a separate development tool, not included
in the SDK. Every run creates a fresh directory containing inputs, bundle, logs,
three raw observations and a verification receipt. No timings are collected.

## Embedded C host

The [development host](../experiments/embedded-js/host.c) compiles the pinned
QuickJS source into a Windows x64 executable and invokes the same observations
through its C API. The host supplies no QuickJS filesystem, network or standard
library bindings to gameplay code. Its C wrapper reads the test files and owns
all JavaScript values, contexts and runtimes. This is an embedding experiment;
it does not yet expose a reusable SDK ABI or retain a context across game frames.

Each case creates and disposes three runtimes in one process. Checks cover normal
execution, malformed JSON, a gameplay exception, interrupted infinite work, heap
exhaustion, startup allocation failure and stack exhaustion. The allocator also
checks overflow, alignment, zero-length requests, growth/shrink behavior and
preservation after a rejected reallocation. Successful calls must leave no queued
JavaScript jobs. Interruption uses a deterministic poll allowance, not a wall-clock
deadline or instruction-count guarantee.

The [Windows receipt](../evidence/embedded-js/windows-host.json) records 21 runtime
cycles with zero tracked live allocations after disposal. Three successful runs
each match all 5,153 numbers exactly, as well as structure, strings and ordering.
The unbundled and bundled Node observations agree. Error checks verify the actual
runtime exceptions; original gameplay fixtures remain unchanged.

The observed peak is 70,950,514 bytes (about 67.7 MiB) requested through the VM
allocator, including parsed content and test observations. It excludes allocation
prefixes, allocator overhead, native input buffers, executable memory and other
process costs. It is neither resident memory nor a frame-allocation budget, and
it does not establish a mobile memory target. The prefix preserves the documented
[Windows x64 allocation alignment](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/malloc?view=msvc-170).
No timing comparison or native-kernel superiority is claimed.

To reproduce, run the build and reference preparation commands above. Install
Visual Studio C tools, then extract `quickjs-amalgam.zip` from the official
[0.17.0 release](https://github.com/quickjs-ng/quickjs/releases/tag/v0.17.0) to a
separate development directory:

```sh
node scripts/test-embedded-host.mjs --amalgam-dir /path/to/extracted/sources
```

The [source lock](../experiments/embedded-js/host-source-lock.json) pins the archive
and source hashes. The script verifies both compiled source files before use,
creates a fresh build/test directory, treats host-code warnings as errors and
preserves raw output and error logs. The separate
[host workflow](../.github/workflows/embedded-host.yml) also verifies the downloaded
archive before extracting only the required files. Upstream source and binaries
are not included in the SDK or committed to this repository. This Windows check
does not establish support on another operating system.

## Decision still required

The next [persistent-session experiment](persistent-native-session.md) retains
shared content and isolated mutable sessions across native calls, with batch and
checkpoint continuation checks. It remains separate from a stable native SDK ABI.

QuickJS's documented [C API](https://quickjs-ng.github.io/quickjs/developer-guide/intro/)
provides explicit runtime/context ownership, memory limits and interruption hooks.
The host experiment now checks ownership, limits and disposal in the cases above.
Persistent context/state ownership, state transfer, batched game-facing calls,
initialization and resident-memory costs still need measurement. Compare the
embedded approach with the native-kernel option on a representative content
workload before selecting an architecture. Preserve the same gameplay
observations across candidates before comparing costs.

Native bindings, engine imports, editor/player lifetimes, supported platforms,
remaining SDK capabilities and physical Steam Deck/mobile tests remain open.
The existing [seven-operation native experiment](native-lifecycle.md) remains
separate. No production dependency or license change follows from this check.
