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

The next step is to collect comparable stack diagnostics and longer failure
traces with the hosted compiler, then verify a targeted repair against original
behavior. Native portability remains open while that investigation proceeds.
