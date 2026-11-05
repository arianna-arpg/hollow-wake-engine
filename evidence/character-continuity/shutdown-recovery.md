# Benchmark failure cleanup

The broader v0.42 regression run failed at the deliberately missing-heal case. Its expected assertion and failed verification receipt were present. The outer process still reached its eight-minute timeout with a null exit status and a SIGTERM signal. This result shows that file-backed output alone did not resolve the intermittent failure. The original log, receipt and process status are retained in `broad-regression-failure.json`.

The benchmark runner now catches workload failures, records the error and sets a failing exit code. Its existing cleanup still disconnects and reaps every owned worker. The process then exits through normal event-loop completion, with a final receipt written at `beforeExit`. This follows Node's documented exit-code mechanism for allowing pending work to finish. [Node process documentation](https://nodejs.org/docs/latest-v24.x/api/process.html#processexitcode)

The local positive course and all four deliberate faults completed. Each run recorded three disconnected, exited workers. A process handle was still reported immediately after worker exit, and the final event-loop receipt reported an empty active-resource list. The positive process returned zero and each fault returned one. Every case retained its expected assertion and input-preservation checks.

The observer requires actual process completion within its original timeout, the correct final exit code, and proof that all three workers exited. The hosted continuity workflow repeats the complete observer three times per platform and retains each receipt. Linux cause attribution remains provisional until the hosted repetitions complete.
