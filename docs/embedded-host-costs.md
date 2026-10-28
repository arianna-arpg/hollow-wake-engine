# Experimental host costs

The [item-index follow-up](item-index-experiment.md) tests an inventory hotspot
found by profiling. Its first shared-index candidate improved Node timings but
regressed in the embedded host and was rejected; production outputs are unchanged.

This experiment measures the existing bundled JavaScript session through two
prototype hosts: Node/V8 with a JSON boundary and the .NET 8 binding to the
QuickJS native library. It characterizes those complete paths. It does not
isolate interpreter performance, select an architecture, accept an optimization,
or establish engine or device support.

The [plan](../experiments/embedded-js/measurements/plan.json) fixes the workloads,
batch sizes, repetitions, ordering and reporting before measurement. The
[Windows receipt](../evidence/embedded-js/windows-host-costs.json) retains the
results and links compressed raw records. Production SDK outputs are unchanged.

## What is measured

Both hosts load the same verified bundle and full item/passive content inputs.
The unbundled SDK module generates expected results. Every sample must match
every response and its final checkpoint exactly. Flattened observations and
final state must also match across batches of 1, 16 and 64 commands.

- Combat: 4,096 commands repeating cast input, timed-effect application, a
  quarter-second advance and a resolved hit. Cast refusals remain ordinary
  gameplay outcomes; target life and resources cannot be exhausted.
- Inventory: 320 commands repeating actual item generation, accepted passive
  allocation, refund and two successful item moves. These are many user actions,
  not a representative single frame.
- Checkpoints: 32 restore/snapshot/destroy round trips with an active cast and
  timed effect. Handle decoding and request construction are included.

Each order uses fresh worker processes, eight warmups and 25 measured samples.
The second order reverses hosts and workloads. All samples remain in the raw
records; summaries use the median, nearest-rank p95 and range within each order.
No outliers are removed. Fixed warmups do not prove JIT or GC convergence.

Batch timing starts with prebuilt requests and ends with returned response
strings. The managed path includes its existing UTF-8 encoding, native calls,
response copying, decoding and release. Setup, expected-result checks, reporting
and memory probes are outside this interval. There is no explicit garbage
collection in throughput trials. Allocation diagnostics are sampled outside
the timer; their instrumentation can still influence later collection.

Initialization includes context/library creation, bundle evaluation, content
parsing and controller construction after file input. Process-ready latency
includes worker startup and reading its job description. Neither is a cold-cache
startup benchmark. The job includes expected observations for verification;
its harness cost is not a shipping host's minimum footprint.

## Memory and allocation boundaries

Seven additional fresh processes per host are observed at named lifecycle
stages. Both use the same Windows observer and
[GetProcessMemoryInfo](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getprocessmemoryinfo).
Private committed bytes describe the process's private commit charge; working
set describes resident pages, including shared pages. Peak working set includes
earlier loading peaks. These are different measures, as specified by
[PROCESS_MEMORY_COUNTERS_EX](https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-process_memory_counters_ex).

The stages distinguish retained loading buffers, caller-input release followed
by host collection, one and eight logical sessions, a retained checkpoint,
disposal and a final host collection. Forced Node collection includes V8; forced
managed collection excludes QuickJS, which keeps its normal collection policy.
The results therefore are not two identical VM collection procedures.

Native requested-byte counters exclude allocator prefixes, CRT overhead,
managed objects, caller buffers and other process memory. Native allocation
counts omit reallocations. Managed allocation counters cover managed process
allocations, not native allocations. Node heap deltas are not allocation counts.
Disposal checks require zero tracked native bytes and blocks; the operating
system need not immediately reclaim all committed or resident pages.

## Recorded desktop observations

On Windows 10 with an i9-10900K, Node 24.9.0 and .NET 8, the final run
matched every expected result in 700 measured samples, 224 warmups and 14
separate memory processes. Values below are per-workload medians in milliseconds,
shown as **forward / reverse order**, not frame budgets.

| Workload | Commands per batch | Node JSON host, ms | .NET/QuickJS JSON host, ms |
| --- | ---: | ---: | ---: |
| combat | 1 | 24.56 / 24.61 | 95.88 / 95.18 |
| combat | 16 | 14.40 / 13.99 | 62.85 / 62.83 |
| combat | 64 | 14.19 / 13.45 | 63.35 / 58.12 |
| inventory | 1 | 33.27 / 31.32 | 143.95 / 129.26 |
| inventory | 16 | 34.87 / 30.90 | 134.70 / 121.05 |
| inventory | 64 | 35.20 / 31.08 | 122.17 / 125.34 |
| checkpoint (32 round trips) | n/a | 33.41 / 33.85 | 39.15 / 38.59 |

The seven fresh memory processes per host produced these medians. The memory
columns are observed after releasing caller loading buffers and collecting the
host heap, with content loaded and no logical sessions yet.

| Host | Initialization, ms | Private commit, MiB | Working set, MiB |
| --- | ---: | ---: | ---: |
| node-bundled-json | 350.9 | 113.9 | 100.2 |
| dotnet-embedded-json | 723.0 | 72.7 | 90.0 |

The embedded prototype had lower private commit but longer execution and
initialization times in these observations. The working-set difference is
smaller than the commit difference. These process measurements include the
runtime and test host; they do not establish a per-actor memory budget.

Batching reduced the observed combat cost and managed allocations, but larger
batches did not consistently improve inventory timing. In both orders the
managed combat allocation median was 1,761,448 bytes at batch 1 and 955,608
bytes at batch 64. This includes response delivery; it is not zero-allocation
simulation and says nothing about native allocation overhead by itself.

Ambient system CPU observations ranged from about 4.1% to 15.6% before the
two orders. Local build and verification jobs were stopped, but the desktop was
not isolated. These observations justify profiling startup, binding copies and
inventory work; they do not justify selecting QuickJS, treating batch 64 as
universally best, or projecting timings onto older devices.

An earlier complete run is retained in the same raw archive. The final run
followed a correction to hash-check the source request fixture and seal the
verified native sources. Workload and worker code were unchanged. The earlier
driver and all its samples are retained rather than discarding an inconvenient
run. Neither run changes the existing performance acceptance criteria.

## Reproduce

First obtain passing session and library results using the
[native-library instructions](embedded-native-library.md). On Windows x64 with
MSVC and the .NET 8 SDK, verify the workloads without recording timings:

```sh
node scripts/benchmark-embedded-library.mjs --verify --library-proof PATH_TO_LIBRARY_RESULT --session-proof PATH_TO_SESSION_RESULT
```

Then stop local builds and verification work, run the repository's required
`npm run benchmark`, and measure the exact verified binaries and inputs:

```sh
node scripts/benchmark-embedded-library.mjs --measure --verification PATH_TO_COST_VERIFICATION
```

The measurement command refuses changed sources, runtime outputs or verified
inputs. It creates a fresh directory and a seal before timing. System CPU
activity is recorded before each order as context, not proof of an uncontended
machine. Hosted CI runs the functional verification mode only; CI timings are
not used as acceptance evidence. Reports contain no native binary distribution.

The next architecture decision still requires targeted profiling, equivalent
alternatives and actual engine/device measurements. This experiment does not
change milestone 43's performance thresholds or the
[content-storage boundary](content-storage.md).
