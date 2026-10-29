# Steam Runtime package experiment

The selected Godot package passes a build in the pinned Steam Runtime 4 SDK and
a separate headless replay in its matching Platform image. The
[hosted evidence](../evidence/godot/steam-runtime-ci.json) retains the inspected
logs, receipts, image identities and container configurations. All 850 SDK tests
pass. The Godot editor, relocated export and Platform replay each pass 98 checks
and reproduce all 60 responses, including 609 numeric comparisons. C++, .NET and
the C++ sanitizer consumer also pass; explicit disposal leaves zero tracked VM
bytes and blocks. These results cover the selected embedded-session capability.

Valve recommends the [Steam Runtime 4 SDK](https://github.com/ValveSoftware/steam-runtime/blob/master/README.md)
for new native Linux games. Its [SDK guide](https://gitlab.steamos.cloud/steamrt/steamrt4/sdk/-/blob/steamrt/steamrt4/README.md)
provides both SDK and Platform OCI images. The
[lock](../experiments/steamrt-godot/toolchain-lock.json) pins their manifests and
configurations to release `4.0.20261021.265997`; the original registry metadata is
retained alongside it. Normal builds use immutable digests, not floating tags.

As the non-root owner of a fresh Linux x86_64 checkout with Docker, Node 24.9.0
and .NET SDK 8.0.427:

```sh
node scripts/test-steamrt-godot.mjs
```

The [workflow](../.github/workflows/steamrt-godot.yml) runs that command on a
separate machine. It builds and verifies the SDK inside Valve's SDK image, using
that image's compiler, linker, CMake and Python. Read-only Node and .NET tools
support the build and independent consumer tests. The existing native-library
checks, sanitizers, Godot import, editor replay and relocated export remain intact.
Both containers use the caller's numeric user and group, checked against their
actual configuration. Build tools receive a private temporary home and an
owner-only `XDG_RUNTIME_DIR`, following .NET's
[Unix named-mutex requirements](https://github.com/dotnet/docs/blob/main/docs/core/compatibility/core-libraries/11/named-mutexes-unix-default-scope.md).
NuGet startup is checked before the expensive build.

The resulting game then runs in the separately pinned Platform image. Only the
exported game and an observation folder are mounted. The package and container
root are read-only; temporary engine files use a bounded temporary filesystem.
Networking is disabled. Exact gameplay responses, all 98 lifecycle/thread checks,
zero tracked VM allocation after explicit disposal, and actual packaged-library
loader paths remain required. Exit failures and engine diagnostics are fatal;
there is no retry. Both image identities and container configurations are retained.

Only containers created by this invocation are removed. Existing image caches,
other containers and prior experiment directories are preserved. A fresh checkout
is required to prevent prior native/session receipts from being mistaken for this
run. Logs and receipts are uploaded by CI; binaries and image layers are not.

Earlier attempts remain available: [missing results parent](../evidence/godot/steam-runtime-startup-failure.json),
[inaccessible container-owned files](../evidence/godot/steam-runtime-ownership-failure.json),
and [.NET mutex initialization](../evidence/godot/steam-runtime-mutex-failure.json).
Their outcomes are preserved separately from the successful run.

This remains the selected embedded-session capability described in the
[Godot guide](godot-native.md). A headless Platform-container replay does not
exercise Steam's client, overlay, pressure-vessel integration, graphics/input,
Steam Deck power limits or older mobile hardware. Those remain separate acceptance
work, along with the rest of the SDK surface and other engine integrations.
