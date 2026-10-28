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

## Decision still required

QuickJS's documented [C API](https://quickjs-ng.github.io/quickjs/developer-guide/intro/)
provides explicit runtime/context ownership, memory limits and interruption hooks.
That makes an embedded host plausible; the CLI test does not verify our use of
those APIs. Next, compare an actual embedded host with the native-kernel option
on a representative content workload, including initialization, peak/resident
memory, state transfer, batched host calls and failure/disposal behavior. Preserve
the same gameplay observations across candidates before comparing costs.

Native bindings, engine imports, editor/player lifetimes, supported platforms,
remaining SDK capabilities and physical Steam Deck/mobile tests remain open.
The existing [seven-operation native experiment](native-lifecycle.md) remains
separate. No production dependency or license change follows from this check.
