# Steam Runtime package experiment

This extends the verified Godot package with a pinned Steam Runtime 4 build and
a separate runtime-only replay. Execution is pending. Source and configuration
alone do not establish compatibility, a Steam client launch or device performance.

The [first hosted attempt](../evidence/godot/steam-runtime-startup-failure.json)
stopped before container creation because the new harness assumed its results
parent directory already existed. Initialization now creates it in a fresh
checkout. That attempt establishes no runtime result; its failure log is retained.

The [second attempt](../evidence/godot/steam-runtime-ownership-failure.json)
reached the host's read of the Godot receipt, then failed because the container's
root-owned private directories were inaccessible to the runner. Artifact upload
also failed. Only the job log survives; the underlying receipts cannot be
independently inspected, so that attempt is not accepted as runtime verification.
Both containers now use the non-root caller's numeric user and group, checked
against Docker's actual configuration. The SDK gets a private temporary home for
tool caches; the Platform uses its bounded temporary filesystem. The correction
still requires a successful hosted replay and readable evidence.

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

This remains the selected embedded-session capability described in the
[Godot guide](godot-native.md). A headless Platform-container replay does not
exercise Steam's client, overlay, pressure-vessel integration, graphics/input,
Steam Deck power limits or older mobile hardware. Those remain separate acceptance
work, along with the rest of the SDK surface and other engine integrations.
