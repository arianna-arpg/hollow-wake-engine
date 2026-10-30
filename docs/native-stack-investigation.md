# Native replay stack investigation

The [Windows embedded-host run for 69729a1](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/41124755267)
fails in installed full-attack replay after three requests. Original replay
completes 33 requests on that same runner. Installed replay reports
`RangeError: Maximum call stack size exceeded`; tracked allocations are fully
released after the failure. Linux in the same workflow passes.

The local Windows replay passed with MSVC 19.38.33133. Hosted Windows uses
19.51.36260. Both receipts identify the same compiled SDK map and installed game
source map. Compiler differences are a hypothesis to investigate, not an
established cause. The host driver and experimental library use a 256 KiB
QuickJS stack guard; changing that guard is not an accepted fix.

A private instrumented copy of pinned QuickJS 0.17.0 measured checked stack spans
of 206,848 bytes for original replay and 218,048 bytes for installed replay with
the local compiler. Both completed 33 requests at 256 and 224 KiB guards and
failed at 192 KiB. Instrumentation can affect compiler layout, so these values
are diagnostic estimates, not production high-water guarantees or device budgets.
The initial local script then attempted to replay a downloaded hosted bundle
that the workflow had not uploaded; that attempt failed without invalidating
the preceding local measurements. Its partial receipts are retained.

The maintained `scripts/diagnose-native-attack-stack.mjs` accepts
`--amalgam-dir <pinned-source>` and optionally `--course <recorded-course>`.
It verifies bundle hashes and the pinned source, builds a private instrumented
copy, and checks 256 and 512 KiB diagnostic limits. A 64 KiB negative control
must report the stack guard. Successful runs must match every recorded Node
observation under the existing geometry-only numerical policy and release all
tracked allocations. Failure traces retain up to 64 frames. None of these
diagnostic limits changes the production driver or native library.

The [local diagnostic evidence](../evidence/native-attack-stack/windows.json)
contains all five runs: original and installed complete at both larger limits,
and the small-stack control fails as expected. Both completed paths compare
150,608 numeric observations each. The hosted workflow now collects the same
diagnostic after full attack replay, including when replay fails; a diagnostic
success does not turn a failed production replay into a passing job.

## Hosted reproduction and direct composition

The [diagnostic run for 9b1e469](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/41129937148)
reproduces the Windows failure. Its [retained evidence](../evidence/native-attack-stack/ci-20261030.json)
records MSVC 19.51.36260 completing original replay at a checked span of 224,672
bytes. Installed replay exceeds the 256 KiB guard after three requests; at the
larger diagnostic guard it completes all 33 requests with a checked span of
268,352 bytes. Linux GCC 13.3 completes both paths at 256 KiB, with checked spans
of 156,784 and 168,000 bytes. All completed observations obey the existing
geometry-only numerical policy, and all runs release their tracked allocations.

The longer Windows trace reaches a supported, triggered attack nested inside
another hit. Each hit retains a preparation callback and a World forwarding
method while landing executes. The full game adapter now passes the already
initialized landing closure directly to preparation. This removes those two
forwarding frames per hit. Preparation-only installation keeps its original
continuation, and the source transform guards both the exact binding and field
initialization order. No SDK runtime, authored content, production stack guard
or accepted observation changes.

A private local bundle experiment separated initialization from request stack
measurement. The installed request span fell from 214,448 to 198,160 bytes;
original replay measured 141,792 bytes. All 33 requests still matched. These are
instrumented local estimates, not hosted measurements or a general performance
claim. Initialization remained the local overall peak, so the maintained
whole-run diagnostic cannot expose that request-only reduction.

The [local candidate evidence](../evidence/native-attack-stack/direct-composition-windows.json)
retains the experiment and checks. The candidate passes C and C++
full-attack replay, all six preparation, landing, sustain, reaction, aftermath
and attack-sequence comparisons, all 1,300 SDK tests and original reference
verification.

## Hosted acceptance

The [exact-commit hosted run for ce96794](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/41135483710)
passes both original and installed full-attack replay on Windows and Linux.
The production guard remains 256 KiB. The [retained acceptance evidence](../evidence/native-attack-stack/ci-direct-composition.json)
includes both native replay receipts, stack diagnostics and the workflow result.
All 33 requests complete, the 150,608 numeric observations follow the unchanged
geometry-only policy, and tracked allocations are released. The deliberately
small 64 KiB guard still fails as expected.

Hosted Windows now measures a checked installed span of 247,584 bytes, compared
with 268,352 before direct composition. Original remains 224,672 bytes. Linux
remains at 156,784 original and 168,000 installed. These instrumented whole-run
spans include initialization and are not uninstrumented worst-case guarantees.

This closes the reproduced nested-attack failure. It does not establish a bound
for every possible authored content composition, complete engine packages or
physical Steam Deck/mobile acceptance.

## Managed replay coverage correction

The full-attack runner used for the preceding evidence executed C and C++.
It recorded C# source hashes, but did not execute the .NET consumer. Separate
library tests exercised .NET against a smaller session fixture. The local
stack-repair and status-delivery summaries have been corrected; their raw
historical receipts remain unchanged.

The runner now builds the existing .NET 8 consumer in a private output directory
and executes the same original and installed bundles and all 33 requests.
It requires actual managed execution metrics, exact agreement with the C driver,
matching clone/log observations and zero tracked allocations after disposal.
The [Windows managed replay evidence](../evidence/native-attack-stack/managed-replay-windows.json)
records 150,608 matching numeric observations on each path and the existing
managed ownership, library lease, thread migration and unload/reload checks.
The shared builder also passes the separate 60-request library regression.

This adds full-course .NET execution coverage. It changes no SDK runtime,
content, comparison tolerance or native stack limit. Hosted Windows/Linux
acceptance for this runner change remains separate from the earlier C/C++ runs.
