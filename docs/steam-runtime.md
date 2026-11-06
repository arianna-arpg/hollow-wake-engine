# Steam Runtime package experiment

The combined crafting and progression addon passed in the pinned Steam Runtime
4 SDK and its matching Platform image. Both exported games used the same
Linux x86_64 addon archive. Crafting passed 180 assertions and its 56 replies
matched the original reference and the Windows observation file byte for byte.
Progression passed 91 assertions, including ten continued reward draws after
restoring a save. See the [session evidence](../evidence/steamrt-sessions/verification.json).

The earlier combat package passed a build in the same SDK and a separate
headless replay in the Platform image. The
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
run. The workflow retains the Linux addon and device test kit after successful
Platform playback. It also retains logs and receipts for diagnosis.

Earlier attempts remain available: [missing results parent](../evidence/godot/steam-runtime-startup-failure.json),
[inaccessible container-owned files](../evidence/godot/steam-runtime-ownership-failure.json),
and [.NET mutex initialization](../evidence/godot/steam-runtime-mutex-failure.json).
Their outcomes are preserved separately from the successful run.

## Install or measure the combined package

Install the Linux addon using the [Godot crafting guide](godot-crafting.md).
Each capability starts on demand. Both games reproduced the accepted results in
separate offline containers with read-only game files. The loader identified
the embedded runtime and Godot extension inside each exported game.

The [device kit](steamrt-device-run.md) contains both exported games, their
matched receipts and the Python measurement runner. The archive shares the
identical engine and libraries through tar hard links. The runner verifies
the exports, uses fresh save directories and records separate process and
embedded allocation measurements. The retained local measurements identify
the Docker Desktop Linux VM. Steam client launch, pressure-vessel integration,
graphics, input, power and physical device measurements remain open.

The Linux host command above builds the base addon, progression addon and combined
package, exports both session courses, and plays them in fresh Platform containers.
For development, the two stages can be run separately. Run the first in the pinned
Valve SDK with matching library, Godot base and tool receipts. Run the second on a
Docker host with the pinned Platform image present.

~~~sh
node scripts/build-steamrt-sessions.mjs --base BASE_DIR --library-proof LIBRARY_DIR --tools TOOLS_JSON --out NEW_EXPORTS_DIR
node scripts/replay-steamrt-sessions.mjs --bundle NEW_EXPORTS_DIR --out NEW_PLATFORM_DIR
~~~

The full workflow collects the engine and component notices from the pinned
Linux Godot editor and includes them alongside the addon notices in the device
kit. Godot documents these attribution records through its Engine API.
[Godot Engine license methods](https://docs.godotengine.org/en/stable/classes/class_engine.html#class-engine-method-get-license-info)
