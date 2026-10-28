# Experimental native library

The persistent session experiment can be called through an eight-function C
interface. C++ and .NET consumers load the same native library dynamically;
the library runs the bundled SDK implementation. Gameplay rules are not
reimplemented in the bindings. The selected gameplay scope remains the
[persistent-session experiment](persistent-native-session.md).

This is a development interface, not a stable ABI, supported engine package or
replacement for the JavaScript package. The build tools now configure Windows
and Linux x64. The [Windows portability regression](../evidence/embedded-js/portability-windows.json)
has passed locally; Linux acceptance awaits inspection of the first hosted run.
ARM, Unity/IL2CPP, Godot, Unreal, mobile platforms and device performance remain
unverified. The existing seven-leaf native experiment is separate.

## Ownership and failure contract

`experiments/embedded-js/native/hwe_embedded.h` defines fixed-width options,
metrics, status codes and an opaque host owner. `hwe_js_layout_v1` reports the ABI
version and structure/pointer sizes; the managed binding checks these before
creating a host. Version one identifies this experiment's layout and does not
promise release stability.

Each host owns one runtime, content controller and all sessions in that
controller. Construction borrows UTF-8 bundle/content bytes for that call only.
It copies input into terminated, owned storage before using QuickJS and releases
the temporary copies. Invalid UTF-8, raw NUL bytes, incompatible options and
oversized inputs are refused. Failed construction disposes partial state and
returns a null owner.

A command has three steps:

1. `submit` executes once and retains one serialized response.
2. `copy_response` copies into caller-owned storage. An undersized buffer writes
   no bytes and reports the required length. Repeating the copy never executes
   the command again. The result has no appended NUL byte.
3. `release_response` releases the retained response. Until then, another submit
   is refused. Destroying the host also releases any pending response.

SDK protocol refusals are ordinary JSON results. An SDK batch execution failure
still uses the logical-session poisoning rules described in the session
contract. Native parse, execution, serialization, interruption and response-limit
failures instead poison the whole host. Its effects may already have occurred;
the caller must destroy it and recover from a known checkpoint. Request length,
UTF-8 and argument errors occur before execution and leave a valid host usable.
A failed temporary allocation also closes the host to further execution.

The library rejects returned promises, queued jobs and observed unhandled
promise rejections. It does not run an asynchronous job loop. It installs no
JavaScript filesystem, network or engine-object bindings. The bundle is trusted
application code: this is not a security sandbox for arbitrary scripts.

Raw C pointers require ordinary native ownership discipline. Arbitrary pointers,
freed aliases, overlapping caller buffers and incorrect storage lengths are not
validated memory capabilities. Destroy clears the owning pointer; repeating
destroy on that cleared slot is safe. A freed alias is invalid.

## Threads, cancellation and loading

One host admits one operation at a time using an atomic guard. Overlapping
operations return `BUSY`; separate hosts have separate state. Serialized calls
may migrate between threads. Each entry refreshes QuickJS's stack origin as
specified by the [pinned upstream header](https://github.com/quickjs-ng/quickjs/blob/v0.17.0/quickjs.h).
This does not make concurrent access to a runtime safe. The native consumers
must provide the stack headroom required by the header; the VM stack limit is
256 KiB.

Cancellation is the concurrent exception: an atomic flag requests interruption
of current or next VM work. It is sticky, does not roll back state, and causes
the host to become unusable for further commands. A late cancellation can arrive
after a response has completed. Interrupt polls are bounded, but they are not
an instruction count, elapsed-time limit or guarantee that every upstream native
operation can be preempted.

The caller must exclude destruction from new entrants and cancellation. A busy
destructor refusing work does not by itself solve a lifetime race: an operation
could begin just after a successful destructor freed the pointer. The library
must remain loaded for every live host and in-flight call.

The C++ consumer uses scoped owners and joins worker threads before disposal.
The managed binding uses `SafeHandle` references for native calls, serializes
ordinary operations, and retains a separate library lease for every host.
Disposing the public library owner prevents new hosts while existing hosts keep
working. The final host release unloads the module. Cancellation takes a handle
lease without taking the operation lock. The design follows Microsoft's
[SafeHandle ownership model](https://learn.microsoft.com/en-us/dotnet/api/system.runtime.interopservices.safehandle).
If native destruction unexpectedly retains an owner, the binding retains its
module lease rather than unloading code still in use.

## Limits and measurements

Default limits are 256 MiB of tracked requested heap bytes, 1 MiB per request,
4 MiB per response and 1,000,000 interrupt polls per work operation. Bundle and
content input limits are 16 and 32 MiB. The header specifies valid option ranges;
zero is not an unlimited setting. Callers should use batching and one content
controller for multiple logical sessions where isolation requirements permit.

The requested-byte accounting includes allocations routed through the tracked
allocator: VM allocations and this library's temporary input copies. It excludes
allocation prefixes, CRT overhead, host metadata, caller buffers, managed
objects and the rest of the process. Response length is checked after
serialization; it is not an independent allocation ceiling. The heap limit
still bounds tracked allocations during that work. These figures cannot be
compared directly with earlier executable probes that excluded input copies.

Neither the C ABI nor a successful .NET call demonstrates lower frame cost,
lower process memory or suitability for older devices. JSON remains a control
protocol for this experiment. Selecting a frame format, content representation
and runtime still requires equivalent workload measurements. The
[host-cost experiment](embedded-host-costs.md) measures equivalent combat,
inventory and checkpoint workloads with separate process-memory observations;
it remains a desktop diagnostic rather than an architecture decision. The
[content-storage boundary](content-storage.md) remains unchanged: validated
content packs and mutable simulation state have different responsibilities.

## Reproduce

The [Windows verification receipt](../evidence/embedded-js/windows-native-library.json)
records source hashes, compiler versions, both consumer results and the earlier
host regressions. It links losslessly compressed raw observations and the full
SDK verification log.

Use x64 Windows with MSVC, or x64 Linux with a GNU-compatible C/C++ compiler and
binutils. Both require the .NET 8 SDK with its offline targeting packs, the
repository's Node dependencies and prepared reference compiler. Fetch and verify
the QuickJS-NG source pinned in `host-source-lock.json` using the existing
[embedded-host workflow](../.github/workflows/embedded-host.yml).

```sh
npm ci
npm run build
npm run reference:prepare
npm run reference:install
node scripts/test-embedded-host.mjs --amalgam-dir PATH_TO_PINNED_SOURCE
node scripts/test-embedded-library.mjs --amalgam-dir PATH_TO_PINNED_SOURCE
```

The library command first creates and verifies a fresh session fixture. CI can
explicitly reuse its preceding session result with `--session-fixture
.artifacts/embedded-session-latest.json`; every recorded source, runtime and
fixture hash is checked. Each library run creates its own output directory and
pins an installed .NET 8 SDK for offline compilation. No NuGet packages are used.

The C++ and managed programs each replay all 60 gameplay requests against the
same native library. Their responses are compared to the independent original
SDK scenario and bundled-JavaScript result, including 609 numeric observations
per consumer. Native contract cases cover buffer retries, input ownership,
Unicode, instance isolation, invalid construction, memory exhaustion, stack
exhaustion, asynchronous misuse, cancellation and failures after mutation.
Thread and loader checks cover serialized migration, busy refusal, concurrent
cancellation, managed handle finalization, and unload/reload.

The shared allocator extraction is also checked through the earlier executable
host and persistent-session suites. Source and production runtime hashes must
remain unchanged during each test. Reports and raw observations live in fresh
`.artifacts/embedded-library-*` directories; builds remain private development
outputs. The public workflow uploads reports and observations, not native
binaries. Shipping binaries requires packaging and third-party notices, and
does not authorize changing the SDK's existing license.

## Linux proof boundary

The shared build helper retains the Windows compiler commands and adds native
Linux builds. It records the actual commands and compiler banners. Linux uses
position-independent code, hidden symbols and strict floating-point options;
only the eight C interface functions may appear in the dynamic export table.
The library links with undefined-symbol checks and immediate relocation. Its
loader requests immediate, local symbol resolution. The runtime source and C
ownership implementation are unchanged.

The pinned runtime's [build configuration](https://github.com/quickjs-ng/quickjs/blob/v0.17.0/CMakeLists.txt)
documents GNU feature definitions, unsigned characters and math/thread support.
The compiler's [visibility documentation](https://gcc.gnu.org/onlinedocs/gcc/Code-Gen-Options.html)
explains the hidden-default/exported-interface boundary. These settings do not
substitute for executing the compatibility, allocator and consumer checks.

Linux verification additionally rebuilds the library and C++ consumer with
AddressSanitizer and UndefinedBehaviorSanitizer, including leak detection, and
repeats all 60 requests and native failure/ownership cases. The .NET consumer
uses the ordinary library in a separate process. This avoids treating managed
runtime allocations as native-library leak evidence. Loader tests verify
reference ownership and successful reopening; they do not guarantee that an
operating-system loader physically unmaps a library at a particular moment.

The host/session/library suites run on both CI platforms. Windows-specific
process-cost and item-index experiment runners retain their Windows scope.
An Ubuntu x64 result cannot establish Steam Deck, ARM, engine import, or mobile
acceptance. Their toolchains, packaging, application lifecycle and physical
device measurements remain separate work.
