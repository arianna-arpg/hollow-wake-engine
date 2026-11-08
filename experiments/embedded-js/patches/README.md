# Pinned native cleanup candidate

The QuickJS-NG 0.17.0 `JS_ToCStringLen2` failure path retains the temporary
string reference acquired for conversion. When its UTF-8 allocation fails,
destroying the host can leave that allocation live. The adjacent UTF-16
conversion already releases its equivalent temporary value on failure.

The candidate inserts that release. Its manifest identifies the exact original
and resulting complete C files. Preparation verifies both upstream files against
the existing source lock, applies one scoped change in memory and verifies the
result before creating a fresh private source directory. Input source drift,
already-patched input, reuse of a destination and writing inside the upstream
source directory are refused. Original source files are never edited.

Run from the SDK root:

```
node experiments/embedded-js/patches/test-cstring-cleanup.mjs --upstream <pinned-source-directory> --output <fresh-report.json>
```

The runner builds the unchanged and patched variants, preserves complete raw
observations, checks six preparation refusals and removes its private files on
success or failure. It supports the configured Windows/Linux x64 compilers and
adds an AddressSanitizer/UndefinedBehaviorSanitizer run with leak detection on
Linux. Only completed runs constitute evidence for their recorded platform;
workflow configuration is not a passing result. Engine integration remains a
separate gate.

This is an explicit candidate. Existing build helpers and public engine archives
do not adopt it automatically. It preserves the original runtime's license header
and does not change the SDK license. Upstream provenance remains the
[pinned release](https://github.com/quickjs-ng/quickjs/releases/tag/v0.17.0).

The focused contract injects allocation failures into 15 conversion cases, seven
allocation positions and both length-pointer forms: 210 cases per build. Inputs
cover ASCII, Latin-1, wide characters, surrogate pairs in UTF-8 and CESU-8,
unpaired surrogates, embedded NULs, slices, ropes, numbers, object coercion,
throwing coercion and error objects. Successful bytes match independent literal
encoding vectors. Failed conversion must reset the supplied length, preserve
the caller's reference for a retry and leave zero tracked bytes and blocks after
runtime destruction. The unchanged source is retained as a failing control.

The separate shared-account exploration found an 86,410-byte retirement leak
after a 32 MiB heap failure in the public Unity progression library. The private
repair restores zero-byte destruction; it does not by itself make that workload
fit 32 MiB. Collection after loading or after account retirement is a separate
policy experiment. Native checks on one desktop do not establish physical-device
performance, a universal memory bound or support in an engine package.
