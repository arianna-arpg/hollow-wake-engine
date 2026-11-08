# Explicit native idle collection

The development C interface adds `hwe_js_collect_v1(host, optional_metrics)`.
Existing create, submit and response-release calls retain their scheduling.
No engine package automatically invokes the new operation. Previously published
DLLs do not export it; a caller must use a newly qualified library before binding
the symbol. The existing structure layouts and ABI version are unchanged.

Choose an idle boundary such as completion of content configuration. Release the
last response first and serialize this call with every other host operation.
The operation collects unreachable cycles and resets the automatic collection
threshold using the pinned QuickJS-NG 0.17 public memory accounting and its
post-collection policy. The SDK allocator's requested bytes are a different
measure and must not substitute for that accounting.

## Behavior and failure

| Condition | Result |
| --- | --- |
| Null host | Invalid argument; optional metrics cleared |
| Another operation owns the host | Busy; optional metrics cleared; no VM work |
| Poisoned host | Poisoned; admitted host metrics returned |
| Retained response | Response pending; exact response and state preserved |
| Sticky cancellation | Interrupted and poisoned |
| Queued jobs, unhandled asynchronous work or a pending VM exception | Script error and poisoned |
| Successful collection | Reachable state preserved; final tracked metrics returned |

The operation never pumps the JavaScript job queue. A FinalizationRegistry can
enqueue a callback during collection; allocation failure can instead leave a VM
exception without a job. Both conditions are terminal. Dispose and recover the
host using the same ownership policy as a failed command. WeakRef target
lifetime is collection-dependent and cannot be used as a gameplay clock.

Collection and the memory-accounting traversal are synchronous native passes.
The VM instruction-poll budget does not bound their duration. Cancellation is
observed around the pass; it cannot stop an in-progress native collection.
Do not invoke this operation on every combat frame. The caller must also retain
the library and host lifetime until the operation completes.

## Qualification

The [Windows checkpoint](../evidence/native-idle-collection/README.md) records
the accepted byte counts, exact replays, failure controls and their limitations.

`scripts/test-native-idle-collection.mjs` builds a fresh shared library and loads
it dynamically. Its C++ consumer includes the established ABI, ownership,
interruption, exhaustion and thread tests, plus explicit collection cases:
reachable cycles and weak keys, unreachable-cycle reclamation, retained response
refusal, thread migration, runtime isolation, sticky cancellation, poisoned
refusal, existing and newly queued finalization, and overlapping execution.

The longer workload repeats the frozen public Unity workshop's 56 original
commands eight times after its two configuration commands. Every workshop reply is
compared to the independently accepted original. Three collection schedules run
in balanced order: unchanged, once after configuration, and after every released
reply. The last is a stress test, not a recommended integration schedule.
Tracked allocations must repeat exactly, stay within the same 32 MiB cap and
return to zero on disposal. Missing collection, pending-response admission,
ignored asynchronous work and ignored cancellation are deliberate faults.

A supplementary test injects exceptions without queued jobs and cancellation
during native collection and accounting. Those hooks exist only in the test
executable. Omitting either exception guard or the final cancellation check must
fail the corresponding assertion. Linux verification additionally runs the
separate-library contracts and full replay with address, undefined-behavior and
leak sanitizers.

The driver preserves source and input hashes, retains compressed compiler and
assertion receipts, and removes its private build and replay directory even on
failure. It reports memory regressions as well as improvements. These results
do not establish frame time, physical Steam Deck/mobile performance, managed
engine memory, or support in a published engine package.

The earlier [startup experiment](../evidence/workshop-startup/README.md) measured
the same underlying approach using private host access. Its accepted source
snapshot predates this public entry point; reproduce that historical experiment
at its recorded commit rather than treating its source hashes as current.
