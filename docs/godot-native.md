# Experimental Godot native addon

The SDK now has a reproducible Windows x64 and Ubuntu 24.04 x86_64 Godot 4.7.2
addon experiment. It builds an archive containing the native bridge, embedded
SDK runtime, selected content,
manifest and notices. Verification installs that archive in a fresh project and
runs the same gameplay course in the standard editor and a relocated release
export. Node.js and .NET are build/test tools, not dependencies of that game.

See the [installation, API and reproduction guide](../experiments/godot-native/README.md)
and the [local verification record](../evidence/godot/windows-native-addon.json).
The [CI workflow](../.github/workflows/godot-native.yml) repeats this path on
separate Windows and Linux machines and uploads observations rather than native
binaries.
The [corrected hosted run](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/40780494509)
passed at `cb60183`. Its [inspected evidence](../evidence/godot/windows-ci.json)
matches all 60 local/independent responses and passes the same 98 checks in both
the editor and relocated release. The broader SDK workflow is tracked separately.

The first hosted attempt at `0cb94c7` compiled the addon and passed the underlying
native-library tests, then exited with `0xC0000005` during first-import shutdown.
The verifier had used `--editor --quit`, which quits after one iteration. It now
uses Godot's resource-aware `--import` lifecycle and a 1000 ms editor-frame delay.
The delay is the documented workaround for the pinned engine's
[cold-import documentation race](https://github.com/godotengine/godot/issues/111048);
the matching failure pattern is evidence for this diagnosis, not a captured
native stack trace. This does not fix Godot itself. The failed attempt is retained,
crashes remain fatal, and there is no automatic retry or skipped gameplay check.
The [import lifecycle record](../evidence/godot/import-lifecycle.json) preserves
that failure and the successful local verification of the revised import path.

Both local runs match all 60 responses, including 609 numeric observations, from
the retained independent SDK scenario. Each also passes 98 boundary/lifecycle
checks. Godot workers exercise serialized calls, responsive metrics, cancellation
and cancellation while another worker waits to close. The relocated release runs
with the original project/export paths unavailable and reads its packaged data.
The README example is separately imported and executed from an installed archive.
Explicit disposal finishes with zero tracked VM bytes and blocks.

The adapter uses a short lifetime lock for cancellation and owner replacement,
and a separate operation lock for execution and close. Close waits for execution
before acquiring the lifetime lock, so a pending close cannot prevent a running
request from receiving cancellation. Metrics return busy without waiting. This
replaces the prototype's shared lifetime lock, whose scheduling could obstruct
new readers while destruction waited. State and RNG remain owned by each runtime
and its logical sessions; gameplay arithmetic is unchanged.

The engine boundary follows Godot's [GDExtension workflow](https://docs.godotengine.org/en/stable/tutorials/scripting/cpp/gdextension_cpp_example.html).
The [export procedure](https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html)
uses the pinned official release template. Editor settings are isolated using
Godot's [self-contained mode](https://docs.godotengine.org/en/stable/tutorials/io/data_paths.html),
with explicit log paths. Compiler input includes all 198 pinned binding sources;
code-generation bytecode caches are isolated in each build's private directory.

This proves the selected session capability through one native engine package
path on two operating systems. It does not establish the complete SDK surface,
stable native APIs, other Linux distributions, other engines, mobile/ARM,
physical-device behavior, or performance gains.
The JSON boundary is an experiment, not an accepted format for every frame.
Godot/process allocations are outside the native VM's tracked-byte counters.
The existing SDK license is preserved. Built archives and exported games remain
local development artifacts; this milestone does not create a registry release.

Linux x86_64 packaging is now configured alongside Windows, with pinned official
editor/export inputs and an Ubuntu 24.04 CI job. The first Linux editor run
completed all 98 checks and matched all 60 responses, but its verifier rejected
optional symbol probes in the mixed Linux loader trace as engine errors. The
standalone Linux release was not reached. The shared
builder also passed a [fresh Windows regression](../evidence/godot/linux-package-preparation.json)
after this refactor.

The [diagnostic separation record](../evidence/godot/linux-loader-diagnostics.json)
retains that failed run and its successful Windows matrix job. The correction
uses glibc's [`LD_DEBUG_OUTPUT`](https://man7.org/linux/man-pages/man8/ld.so.8.html)
to retain the actual child process's loader trace separately, including on
failure. Godot's error gate remains unchanged. Another local Windows editor and
release regression passes.

The [corrected Windows/Linux run](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/40785255940)
passed at `b8757a7`. Its [inspected evidence](../evidence/godot/portability-ci.json)
checks the source fingerprints, underlying native/session proofs, official tool
pins, addon manifests and raw responses. All four editor/release runs pass 98
checks and match the same 60 responses and 609 numeric observations. Linux loader
traces confirm that the installed project and relocated game load their own two
packaged libraries. Explicit disposal reports zero tracked VM bytes and blocks.

The Linux bridge links the embedded library by filename using CMake's
[`IMPORTED_NO_SONAME`](https://cmake.org/cmake/help/latest/prop_tgt/IMPORTED_NO_SONAME.html)
and builds with its installation search path, `$ORIGIN`, using
[`BUILD_WITH_INSTALL_RPATH`](https://cmake.org/cmake/help/latest/prop_tgt/BUILD_WITH_INSTALL_RPATH.html).
The verifier inspects the resulting ELF dependencies/search path, removes loader
environment overrides, and checks actual loader traces against the installed
and exported library paths. Both platform replays now hide the native compiler
input, bridge build and staging directories. The release also hides the original
project/export paths and verifies that the exported libraries match the addon.
These checks address accidental dependencies on a developer's build tree; they
do not measure performance or establish SteamOS/mobile compatibility.

The retained ELF version requirements include `GLIBC_2.38` for this Ubuntu-built
bridge. That is a concrete compatibility requirement, not a universal Linux
binary guarantee. Valve currently recommends building new native games inside
the [Steam Runtime 4 SDK](https://github.com/ValveSoftware/steam-runtime/blob/master/README.md)
and selecting its matching runtime; the older sniper target has its own SDK.
A [pinned Steam Runtime 4 SDK build and matching Platform replay](steam-runtime.md)
now pass for this selected capability, with inspected hosted evidence. An actual
Steam client launch and physical-device measurements remain separate work.
Current binaries are experimental build outputs.
