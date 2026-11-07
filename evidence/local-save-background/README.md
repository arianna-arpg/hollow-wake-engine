# Standalone background-save addon

The independent Godot local-save addon adds one bounded background request,
ticket polling and cancellation. It keeps the existing SQLite schema and WAL
durability settings. Completion is consumed once; close joins outstanding work.
The API and cancellation boundary are described in
[the addon guide](../../adapters/godot/local-save/README.md).

Windows x64 and Steam Runtime 4 Linux x86_64 binaries pass normal empty-project
imports and real SQLite contract checks. The scheduler is also checked with a
controllable backend and deliberate faults. Linux address, leak and undefined
behavior checks pass; its ThreadSanitizer could not initialize in the container.
These desktop checks do not establish Steam Deck, older mobile or ARM support.

The paired measurement alternates synchronous/background order within four
repeats, with eight warmups and 32 retained samples per mode/repeat/size. Each
save contains two equally sized documents. All 960 committed revisions and
paired document bytes are checked per platform; raw warmups and samples remain
in measure-windows.json and measure-linux.json.

| Host | Bytes per document | Synchronous main-thread median | Background main-thread median | Background main-thread p95 |
| --- | ---: | ---: | ---: | ---: |
| Windows desktop | 2,048 | 66.632 ms | 0.105 ms | 0.170 ms |
| Windows desktop | 65,536 | 69.893 ms | 0.312 ms | 0.365 ms |
| Windows desktop | 524,288 | 97.330 ms | 2.031 ms | 2.382 ms |
| Linux container | 2,048 | 2.482 ms | 0.043 ms | 0.057 ms |
| Linux container | 65,536 | 2.811 ms | 0.328 ms | 0.496 ms |
| Linux container | 524,288 | 6.476 ms | 2.547 ms | 4.084 ms |

These are summed native submission/poll costs, excluding gameplay,
serialization, verification reads and rendering. They establish reduced main
thread occupancy in this workload, not faster disk commits. Windows background
completion medians remain about 67–98 ms. Its maximum-size completion p95 is
306 ms versus 218 ms synchronously. Linux background completion medians are
8.2–11.3 ms versus 2.5–6.5 ms synchronously because the host polls on later frames
at a 120 fps cap. The first background request used 0.142 ms of main-thread
native calls on Windows and 0.156 ms on Linux.

The Windows synchronous 2 KiB series contains a 5.446-second outlier. It is
retained, with no attribution to a specific system cause. The workloads differ
from earlier inventory measurements and should not be used to claim a
before/after change in underlying storage throughput. Startup, serialization,
recovery, full-frame costs and physical devices need separate measurements.

Reproduce with the generic drivers and a fresh output:

```text
node scripts/test-save-worker.mjs OUTPUT_JSON --mutations
python -I -B scripts/check-background-store.py EDITOR BUILD_RECEIPT ADDON_ZIP SCRATCH OUTPUT_JSON
python -I -B scripts/measure-background-store.py EDITOR ADDON_ZIP SCRATCH OUTPUT_JSON
```

Only the independent addon, generic tests and their evidence belong to this
public component. Full game content and inventory-player acceptance are separate.
