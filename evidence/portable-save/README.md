# Portable save extraction

This checkpoint moves the accepted Godot SQLite implementation into an optional
engine-independent C++ library with a C interface and a reusable C# binding.
The Godot adapter delegates to the same core. Authored gameplay definitions and
the TypeScript runtime do not acquire a database dependency.

The raw implementation before extraction is retained under
`baseline/portable-save`. One intentional correction handles an allocation
failure while starting the writer thread, clears its unstarted request and
allows a retry. The original source capture is not rewritten for that correction.

The Windows acceptance record is `windows.json`; `windows-raw.json.gz`
contains the exact source-bound build receipts, consumer and worker observations,
Godot comparisons, SDK preservation checks and rejected diagnostic attempts.
The document [boundary and reproduction commands](../../docs/portable-saves.md)
identify the remaining engine and hardware gates.

The native courses cover paired documents, stale writers, revision and size
bounds, rollback, failed commits, cancellation and ticket ownership. A separate
C caller checks the public interface, and C# exercises the actual delivered
Release DLL. The thread-start failure course injects allocation and OS failures,
then retries through a real thread; reverting its recovery makes the test fail.
Existing worker barriers and deliberate source faults remain required.

The Godot comparison installs the accepted original addon and the rebuilt
adapter into disposable editor projects. Independent SQLite observations check
their persisted state. All synchronous observations match after removing timing
samples and archive identity; the background save courses also pass. These are
compatibility checks, not a performance comparison.

The focused hosted workflow additionally builds and tests Windows and Linux
Release deliveries. Linux address, leak and undefined-behavior checks use a
separate instrumented build. Workflow configuration alone does not establish
that either hosted run passed.

This record does not establish Unity durable-save integration, ARM/mobile
packaging, Steam Deck measurements or physical power-loss behavior. The frozen
Unity workshop preview still uses in-memory checkpoints.
