# Repaired native runtime and Unity patch recipe

This opt-in build profile uses the pinned QuickJS-NG 0.17.0 source plus the
qualified CString cleanup patch. It leaves the original source and older
package recipes intact. The current recipe qualifies Windows x64; the separate
focused cleanup comparison also passes on Linux, including sanitizers.

The profile includes the existing optional hwe_js_collect_v1 entry point.
No automatic collection is added to creation, commands, or response release.
The Unity C# binding is unchanged. A caller must still discard a poisoned host.

## Build and verify

From the repository root, with MSVC, .NET 8, Python and the pinned upstream
source available:

    node experiments/embedded-js/patches/build-qualified-runtime.mjs --amalgam-dir SOURCE --python PYTHON --output FRESH_RUNTIME_DIRECTORY
    node experiments/embedded-js/patches/test-qualified-runtime.mjs FRESH_RUNTIME_DIRECTORY
    node experiments/embedded-js/patches/test-qualified-collection.mjs --runtime FRESH_RUNTIME_DIRECTORY --package PUBLIC_GAMEPLAY_0.2_ARCHIVE --python PYTHON --output FRESH_COLLECTION_REPORT

The builder runs original and repaired libraries through existing C++ and C#
ownership contracts and all 579 frozen shared-account commands. It also checks
the 32 MiB failure, rejected reuse, absent response and destruction, followed by
the complete 48 MiB course. The output DLL must match the repaired row exactly.
Fourteen deliberately corrupted receipts test source, binary, response and
failure-state admission. The exact compiled-source inventory is required.

The collection check loads that output DLL, repeats the original 56-command
workshop eight times after configuration, and compares every reply for three
schedules. All public collection/ownership contracts run for each schedule.
The every-release schedule is a stress check, not an integration recommendation.

Private compiler, managed-project and replay folders are removed even on
failure. Runtime output and compressed receipts are intentionally retained.
Checks are reproducible; byte-identical DLLs across compiler installations or
build times are not promised. Each package pins its actual DLL hash.

## Derive the Unity package

    python -I -B experiments/embedded-js/patches/test-unity-cleanup-archive.py PUBLIC_GAMEPLAY_0.4_ARCHIVE
    node experiments/embedded-js/patches/package-unity-cleanup.mjs --parent PUBLIC_GAMEPLAY_0.4_ARCHIVE --runtime FRESH_RUNTIME_DIRECTORY --python PYTHON --output FRESH_PACKAGE_DIRECTORY

Only the exact public gameplay 0.4 archive is admitted. The derived 0.4.1 preview
changes the native DLL and package version, and adds an ignored documentation
file recording native provenance. Every other archive member, including
scripts, content, GUID metadata and license notices, must remain byte-identical.
Thirteen archive controls cover this preservation and malformed inputs.

This is an archive patch, not a new SDK compilation. The parent receipt preserves
its original SDK identity and package-metadata hash. Its compiled runtime
sources must still match the repository; an unrelated later SDK export does
not become part of this archive.

A package-build receipt is not engine acceptance. The actual tarball must pass
the existing Unity progression, combat/pouch/workshop, live-equipment and durable
account/storage verifiers, with relocated player execution. Published storage
0.3 remains optional and unchanged; its package has no mandatory gameplay
dependency. Linux engine packages, IL2CPP and physical Steam Deck/mobile
qualification remain separate.

The 32 MiB shared-account course still fails without a separate memory policy.
The repair guarantees cleanup for the tested failure; it does not establish
that this workload fits 32 MiB or meets a device frame-time budget.
