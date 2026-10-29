# Native full-game attack course

The real Hollow Wake adapter now completes the frozen Cleave course in the
pinned QuickJS-NG 0.17.0 development driver on local Windows x64. The original
game and installed SDK adapter produce identical native observations: 114 checks,
7,264 events, 2,733 random samples and 150,608 numeric comparisons. This exercises
actual World casting, damage, statuses, buffs, flight, recovery and cleanup,
including the shared synchronous services behind the extracted controllers.
The original and installed courses also pass through the shared native library's
C interface and its independent C++ consumer. Both library replays match the
development driver exactly, dispose all tracked allocations, and pass the
existing buffer ownership, thread migration, cancellation and unload/reload
checks. This course has not yet been replayed through Godot, C# or another engine.

Both bundled Node replays exactly match the existing original fixture. Each
native replay differs from Node only in two observations of the same facing
angle, by `4.440892098500626e-16` radians. The comparator permits the existing
cross-runtime `1e-12` relative/absolute tolerance only for observed actor-facing
angles. Random values, timers, damage, identities, decisions and ordering stay
exact. Original and installed native results match without tolerance. Expected
fixture files are never rewritten.

## Construction repair

The first installed native attempt threw on the first hit while constructing
`WorldProcs`. `ProcRuntime` froze the object before the derived adapter's private
fields were initialized. Node 24.9 permits that sequence, but the pinned native
source explicitly implements the TC39
[nonextensible private-elements proposal](https://tc39.es/proposal-nonextensible-applies-to-private/).
That proposal is a Stage 3 draft, not a claim of a universally deployed rule.

The base now freezes direct instances only. Subclasses finish their fields and
own final freezing; the game adapter freezes itself at the end of construction.
The internal bound ports still freeze immediately. This also permits ordinary
public subclass fields, which the previous implementation rejected in Node.
One regression checks subclass initialization, post-construction immutability,
private mutation and real proc dispatch. A native negative control restores the
early freeze only in a disposable bundle: Node still matches the complete course,
while native execution fails at the same constructor before the first request
completes. No upstream runtime or gameplay arithmetic is patched.

## Scope and host services

This is an integration diagnostic, not a new command API or a standalone engine
package. It bundles the original game's World, content and headless arena with
the installed SDK. The existing native session API and its 60-request acceptance
course remain unchanged. Each process owns one isolated runtime; the diagnostic
does not claim independent concurrent Worlds inside that runtime.

The accepted observer becomes a generator yielding between its 31 complete
groups. A final request completes it; one additional request retrieves logs and
host-service counters. No gameplay callback crosses a native request boundary.
The existing driver retains its memory, stack, interruption, pending-job and
disposal checks.

Original arena services are test-only: its existing in-memory persistence/fetch
shims, collected console diagnostics, a deliberately restricted plain-data clone
and a coarse nondecreasing wall clock for optional background generation work.
The clone rejects unsupported prototypes, functions, symbols and accessors; it
preserves cycles, aliases, holes and undefined fields. All 931 reached clone
operations independently match Node's built-in `structuredClone` during each
Node replay. The clock is not a frame timer or performance measurement. These
services are absent from the production SDK and existing native session bundle.

The installed diagnostic bundle is 13,840,640 bytes and retains extensive test
observations. Its tracked peak allocation is 200,921,193 bytes versus 160,481,753
for the original diagnostic. These are whole-course requested-byte counters,
not process memory or steady-state gameplay requirements. All three native runs,
including the deliberate failure, finish with zero tracked live bytes/blocks.
The library's installed-course peak is 200,929,369 tracked bytes; its accounting
also includes temporary input copies, so it is reported separately from the driver.
This does not establish low-end suitability or a speed/memory improvement. A
lean actor/delivery boundary, native package API, current-content reconciliation
and physical-device profiling remain necessary.

## Reproduce

Prepare the pinned reference, its tools, and a fresh complete adapter using the
existing repository commands. Obtain the verified QuickJS source described in
[the native library guide](embedded-native-library.md), then run:

```sh
node scripts/test-native-attack-course.mjs --location .artifacts/adapter-location.json --amalgam-dir PATH_TO_PINNED_SOURCE
```

Every run creates a fresh `.artifacts/native-attack-course-*` directory with
bundler input maps, transformed observation sources, compiler commands, logs,
raw Node/native responses and input/output hashes. Source, installed package and
runtime outputs are checked for changes afterward. The Windows/Linux embedded
host workflow now runs this additional comparison; hosted results are separate
from the local Windows evidence. The existing public game-adapter preparation
path includes the corrected constructor binding.

The [retained Windows evidence](../evidence/native-attack-course/windows.json)
includes raw comparisons, failed discoveries and the constructor negative control.
