# Experimental Hollow Wake addon for Godot

This development package connects the existing Hollow Wake SDK to Godot's native
extension interface. The current proof targets the standard **Godot 4.7.2 Windows
x64** editor and release export. It needs no Node.js or .NET runtime in the game.
Build tools need Node.js, Python, CMake, Ninja and the Visual C++ toolchain.
Automated import uses `--import --frame-delay 1000` for the pinned editor's
[cold-import shutdown issue](https://github.com/godotengine/godot/issues/111048).
This is a build-tool workaround, not an engine fix or a runtime delay. Import
must still exit successfully on its first attempt. Immediate editor shutdown
after a first scan remains an upstream limitation of this engine version.

The package exposes the selected `embedded-session/experiment-v1` capability:
character/skill configuration, resolved hits, item generation and forging,
equipment and passive changes, inventory movement, ordinary casting, a timed
damage effect, and component snapshot/restore. It retains the SDK implementation
and authored definitions. It does not expose every SDK module or replace a whole
game's actor, spatial, rendering, persistence or authority systems. The protocol
and native ABI remain experimental. Linux Godot, other engines, ARM, mobile and
physical-device performance have separate acceptance work.

## Install a locally built package

Extract `hollow-wake-godot-experimental.zip` into a project so that it contains
`res://addons/hollow_wake/hollow_wake.gdextension`. Godot imports that extension
and registers the reference-counted `HollowWakeHost` class. Keep the native
libraries, data, manifest and notices together in that addon directory. Hot
reloading the native library is disabled; close the editor before replacing it.

```gdscript
extends Node

var host := HollowWakeHost.new()

func _ready() -> void:
    var base := "res://addons/hollow_wake/data/"
    var initialized := host.initialize(
        FileAccess.get_file_as_bytes(base + "bundle.txt"),
        FileAccess.get_file_as_bytes(base + "content.json"))
    if initialized != 0:
        push_error("Hollow Wake initialization failed: %d" % initialized)
        return

    # Authored Magician/Ruin example. Replace it with your own selections.
    var created := host.submit_json(
        FileAccess.get_file_as_string(base + "example-create.json"))
    if created.status == 0:
        print(JSON.parse_string(created.response))
    else:
        push_error("Hollow Wake request failed: %d" % created.status)

func _exit_tree() -> void:
    host.cancel()
    host.close()
```

Follow the versioned session protocol for later requests. A cast
advance reports its event; the game decides when and where to resolve a hit.
The default content belongs to this verification sample, not every game project.

## Ownership and failure behavior

`initialize(bundle, content, heap_limit_bytes = 268435456)` returns a native
status and refuses to replace a live owner. The heap limit covers tracked VM
allocations, not Godot objects, allocator overhead or total process memory.
Requests are limited to 1 MiB UTF-8 and responses to 4 MiB. These are limits,
not recommended frame budgets. Bundle/content construction limits and the C ABI
contract remain those of the experimental embedded host.

`submit_json(request)` returns `{status, response}` on success; `response` is a
JSON string. Failures return `{status}`. Ordinary calls on one owner serialize.
Parsing/execution/serialization failures can leave state changed and poison the
owner. A response-copy failure also prevents further delivery through the
adapter. Do not retry an uncertain command: close that owner and restore a known
checkpoint into a new session. A successful native status is a delivered protocol
reply; inspect the reply for per-command results and ordinary gameplay refusals.

`get_metrics()` returns a snapshot or `{status: 6}` when an ordinary operation
is busy. It does not wait for execution. `cancel()` can overlap a request and
remains available while `close()` waits for that request. Cancellation is sticky
and does not roll back effects. `close()` is idempotent and retains final tracked
metrics; it waits for ordinary work and disposes the native owner. The wrapper's
destructor also calls close. Keep Godot references alive across worker calls;
scene-tree access and game objects retain Godot's normal thread restrictions.

Status values are defined by `hwe_embedded.h`: 0 success, 1 invalid argument,
2 limit, 3 allocation failure, 4 script failure, 5 poisoned, 6 busy, 7 response
pending, 8 no response, 9 short response buffer, 10 interrupted, 11 tracked leak,
12 invalid UTF-8. Reading metrics after explicit close reports final tracked
allocations. Tests measure explicit disposal; they do not equate it with zero
process memory or prove every out-of-memory path in Godot itself.

## Reproduce from the SDK repository

Prepare the existing SDK build/reference and embedded-library proof first:

```text
npm ci
npm run build
npm run reference:prepare
npm run reference:install
node scripts/test-embedded-library.mjs --amalgam-dir PATH_TO_PINNED_QUICKJS
node scripts/prepare-godot-tools.mjs --cmake PATH_TO_CMAKE --ninja PATH_TO_NINJA --python PATH_TO_PYTHON
```

The QuickJS source lock and download procedure are in the SDK's embedded-host
documentation. Godot preparation downloads about 1.37 GB of pinned official
archives, extracts only Windows x64 editor/templates and the pinned C++ binding
source, and writes a fresh tools JSON under `.artifacts`. It checks archive,
executable, template and all 198 binding-source hashes. Python must support
`tarfile`'s `data` extraction filter. The preparer prints the tools JSON path;
the session/library commands print their result directories.

```text
node scripts/test-godot-native.mjs --tools TOOLS_JSON --library-proof LIBRARY_RESULT --session-proof SESSION_RESULT
```

The verifier builds the native bridge, creates an addon ZIP, installs that ZIP
into a fresh project, imports it with an isolated editor, executes the gameplay
and threading course, then exports a release game. It relocates that game and
makes the original project/export directories unavailable during its replay.
Both runs consume packaged resources and compare every response to the retained
independent SDK observations. It retains commands, logs, manifests and hashes in
a fresh result directory. Native build metadata is excluded from the addon ZIP.

The source lock verifies inputs, not bit-for-bit reproducibility of compiler
output across toolchains. CPU, frame-time and physical-device measurements are
not inferred from functional checks. The ordinary SDK regression suite remains
`npm run verify`.

The SDK keeps its existing PolyForm Noncommercial license. The addon carries the
SDK license/provenance, godot-cpp's license and the copyright/license notices from
the pinned QuickJS amalgam, including its Unicode data. The host game's own Godot
distribution and other dependencies retain their corresponding notices.
