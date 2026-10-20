# Native lifecycle experiment

This is an experimental C ABI for seven already extracted lifecycle operations,
with a C# binding. It is not a native implementation of the whole SDK or an
installable Unity, Godot or Unreal plugin. JavaScript remains the implementation
authority for the broader extracted systems. Keep this small second implementation
under differential verification while deciding whether a larger native kernel is
justified; do not silently create two independently evolving gameplay authorities.

## Why this boundary

The original game already delegates these leaves through its first-party adapter.
They carry no rendering objects, strings, registries, random generators or identity
allocation, making them a useful first foreign-call experiment. A host receives
resource payments, duration decisions, cast progress, cooldown changes, strongest
replacement and raw timed damage. The host still owns gates, interruption policy,
cooldown stamping/removal, effect creation/removal, attribution, damage routing,
projectile delivery and event presentation. The full `CastRuntime` and `TimedDamage`
classes have not been ported.

This choice follows an inference from documented engine integration surfaces:

- [Unity 6 native plugins](https://docs.unity3d.com/6000.0/Documentation/Manual/plug-ins-native.html)
  expose native code to managed callers. A C ABI and blittable C# records provide a
  plausible boundary; editor/player, Mono/IL2CPP and platform packaging tests remain necessary.
- [Godot GDExtension](https://docs.godotengine.org/en/stable/engine_details/engine_api/gdextension/what_is_gdextension.html)
  loads native shared libraries through a Godot-specific interface and descriptor.
  This library still needs that adapter; an ordinary C ABI is not itself a GDExtension.
- [Unreal external libraries](https://dev.epicgames.com/documentation/unreal-engine/integrating-third-party-libraries-into-unreal-engine?lang=en-US)
  use module build rules and platform library staging. A C++ header consumer can
  establish linkage, but does not verify Unreal module initialization or distribution.

No embedded JavaScript VM is added. That avoids introducing a new runtime merely
to prove these numeric leaves. It does **not** establish that a native rewrite of
all gameplay is cheaper or faster than embedding a VM; compare those alternatives
on a representative content-heavy path before making the full-runtime decision.

## ABI v1 contract

`native/include/hwe_lifecycle.h` is the declaration authority. Export names include
`_v1`; layout version is `0x00010000`. `hwe_get_layout_v1` reports the three record
sizes. Bindings must verify version, sizes and field offsets before gameplay calls.
Fields use binary64 and fixed-width integers; there are no native booleans, strings,
container types, opaque engine pointers or ownership transfers in public records.

| Record | Layout in bytes | Meaning |
| --- | --- | --- |
| `hwe_resources` | mana 0, life 8; total 16 | Also used for resolved costs |
| `hwe_cast` | elapsed 0, total 8; total 16 | One caller-owned active cast clock |
| `hwe_dot` | remaining 0, dps 8, stacks 16; total 24 | One caller-owned raw effect |

The caller owns all memory. Supply valid aligned buffers of at least `count`
elements, keep them alive for the synchronous call, and do not modify/read writable
buffers concurrently. Input and output ranges must not overlap; read-only resource
and cost inputs to `can_pay` may be identical. Count zero permits null buffers but
still validates `dt`. The C# binding instead requires non-null arrays even for an
empty batch and checks the count against both array lengths before pinning them.
Native code cannot validate the allocation behind an arbitrary non-null pointer.

Every function returns an `int32_t`: 0 success, 1 invalid argument, 2 arithmetic
overflow/nonfinite result, 3 insufficient resources (payment only). Error results
preserve every state/output byte. An entire timer batch validates before any writes;
this costs a second pass but needs no scratch allocation or rollback buffer.
Results are ordinary data; no exception, allocator, callback or error string crosses
the boundary. No pointer is retained and no process-global gameplay state exists.
Independent buffers may be used concurrently. There is no internal synchronization.

Accepted numbers are finite. Time, elapsed/total cast time, costs, mana, recovery
rates, DPS and stack counts must be nonnegative. Life and remaining cooldown/effect
time may be negative. Fractional stacks remain legal for the raw leaf; the stronger
one-stack Burning policy belongs to the caller. These checks are intentionally
stricter than the TypeScript helpers' assumptions about some internal raw records.
Only accepted input states are covered by cross-runtime equivalence.

Life payment must leave life strictly positive. A use time at or below 0.001 s is
instant; other bars floor at 0.2 s. Equal/weaker DPS does not refresh duration.
Effect ticking pays the **full supplied frame**, including the expiry frame. The
caller removes expired records afterward. Subdividing a frame can therefore change
damage under the existing compatibility rule. Cast completion and expiration flags
do not remove records or guarantee exactly-once delivery on their own.

## Numerical and allocation requirements

Builds require IEEE binary64, strict floating-point order, no fast math and no
multiply/add contraction. Keep round-to-nearest and gradual underflow enabled in
the calling thread; changing the host floating-point environment is outside this
contract. C11 layout assertions and the managed startup checks fail incompatible
layouts. Current proof builds target x64 Windows/MSVC and x64 Linux/C11 compilers.
ARM, 32-bit devices, macOS, WebAssembly and console/mobile packages are unverified.

The implementation contains no heap allocation. Managed successful batch calls
pin reusable arrays and do not marshal/copy per-element records. Verification
measures `GC.GetAllocatedBytesForCurrentThread` around 10,000 warmed iterations of
the three batch calls (256 effects, 256 cooldowns, two casts). Zero in this scope
does not measure native/OS allocations, initialization, exception paths, whole game
frames or real-device performance. Two-pass validation is deliberate and must not
be removed for an unmeasured speed claim.

## Reproduce and package

```sh
npm ci
npm run native:verify
npm run native:pack
```

Use .NET SDK 8 and either Visual Studio C tools on Windows x64 or `cc`/`c++` on
Linux x64. No NuGet packages are restored from the network. The script selects an
installed .NET 8 SDK, keeps build output under a fresh `.artifacts` directory and
does not modify global compiler settings. The runtime has no third-party library
dependency; the Windows build links the Microsoft C runtime statically. System
platform libraries are still dependencies.

Verification dynamically loads the built library from a C# caller, links a C++
consumer, and tests invalid batches in C. It replays all 69 previously captured
original-game steps with host orchestration, then 6,020 deterministic comparison
cases against the TypeScript leaves. Original fixtures are never regenerated here.
Two temporary compiled faults (bar floor and clipped expiry damage) must fail the
original traces. Linux additionally runs C contracts with address/undefined-behavior
sanitizers. Fixture, source and binary hashes accompany each receipt. Comparisons
use the SDK's `1e-12` absolute/relative tolerance and exact discrete decisions; bit
equality is also counted, not assumed as a network lockstep guarantee.

Packaging verifies source/binary hashes, creates a platform-specific archive with
the header, binary/import library, C# binding, contract, license and receipt, then
rebuilds independent C++ and C# consumers from the extracted archive. This is an
experimental lifecycle distribution, separate from the JavaScript npm package.
Do not label that archive a complete engine plugin.

## Next acceptance work

Actual engine imports and player builds, explicit platform/version support,
installation examples and unload/reload tests are still pending. Expand the native
surface only with original traces, content capability checks and ABI migration
tests. Steam Deck and named older mobile hardware need measured frame/allocation,
startup, memory and battery/thermal workloads before performance claims. The
unrelated original Inventory Escape-course failure remains tracked separately.
