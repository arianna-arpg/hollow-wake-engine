# Cleanup candidate: hosted and native evidence

The [revision-2 workflow](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42513243887)
passed on Windows x64 and Linux x64 at commit
64e2f113c9988df0173b92642013630c3049f045. Linux includes AddressSanitizer,
UndefinedBehaviorSanitizer and leak detection. All receipts, full returned-byte
observations, compiler commands and workflow job metadata are retained in
[hosted](hosted). The source-bound checker rejects 16 deliberately corrupted
Windows receipts and 19 Linux receipts.

Each mode covers 210 cases. Windows has original/repaired, cold/initialized
modes; Linux repeats those under sanitizers. Initial conversions match literal
byte vectors. Original and repaired behavior matches exactly within each build
configuration, including cold retry errors. Initialized repaired retries pass
and all repaired instances reach zero tracked allocations after destruction.
This does not promise recovery of a VM after out-of-memory failure.

[Native follow-through](../native-followthrough) additionally compares the
current experimental library through its existing C++ and C# consumers. Both
original and repaired libraries match all 579 account/workshop replies and pass
their ownership, concurrency, thread-transfer and unload controls on Windows.

The explicit 32 MiB failure probe reaches the same script error in both
libraries. Both refuse further execution as POISONED and expose NO_RESPONSE;
these refusals leave metrics unchanged. Original destruction leaves 86,410
tracked bytes; repaired destruction leaves zero. At 48 MiB both finish all 579
commands. The first follow-through observer used incorrect numeric status
expectations; its failed report and exact script are retained. The corrected
observer reads those constants from the pinned native header.

## Historical evidence

Revision 1's Windows acceptance remains unchanged in meaning. Its original
acceptance bytes and workflow are preserved under
[revision-one-provenance](../revision-one-provenance). Only the workflow source
reference moves to that preserved file. The historical workflow is now manual;
its known Linux failure is retained and is not reclassified. Revision 2 is the
automatic focused qualification.

## Recheck and remaining work

Run:

    node experiments/embedded-js/patches/check-cstring-integration-evidence.mjs

The checker binds compressed receipts to source hashes, matches the raw native
replies against the input course, and verifies failure/reuse/disposal results.
The isolated native runner is retained verbatim in each raw receipt alongside
the build commands. Its input capsule is preserved for later reproducible
integration tooling.

The patch is still a candidate. Production build recipes, Unity/Godot/Unreal
archives and original-game integration have not adopted it. This evidence does
not establish physical Steam Deck/mobile performance, elapsed-time budgets,
full runtime OOM recovery, or a new automatic collection policy. The 32 MiB
workload still needs a separately qualified memory policy; fixing disposal
does not make that workload fit.
