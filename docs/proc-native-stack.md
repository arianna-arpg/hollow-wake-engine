# Native stack use during triggered casts

The original and installed games passed all 328 proc courses locally. A hosted
Windows build exposed nine stack overflows in the installed game under the
existing 256 KiB embedded stack limit. The original game passed on that machine.
Linux matched the complete observations through C, C++ and .NET. The Windows
driver completed every request because the observer captured the stack
exceptions as gameplay outcomes. The comparison rejected those outcomes.
[Hosted replay](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/41877481838)

The affected cases include Answering Gale, Rimewake Release, Lattice Discharge,
Breach Bell and five variants of the same nested cast. The local Windows
compiler was MSVC 19.38.33133. The hosted compiler was MSVC 19.51.36260.
Identical gameplay can consume different amounts of native stack under those
builds.

## Changes

The installed World now assigns the SDK's existing execution and casting
functions directly to its two private entry points. The World still exposes the
same instance call sites, arguments, return values and live host callbacks.
The installer checks the complete casting forwarder and its initialization
order before replacing it.

The native replay also runs one intact original course directly from each
request. Its schedule lives between requests. This removes a suspended generator
from the active test stack. The original content, observer, draw order, 28
intentional callback failures and production heap and stack limits are fixed.

The local diagnostic varied the adapter and the test scheduler independently.
Every version returned the same complete observations at the diagnostic ceiling.

| Local Windows build | Answering Gale, checked bytes | Breach Bell, checked bytes |
| --- | ---: | ---: |
| Preceding adapter and generator | 224,736 | 218,608 |
| Direct World entries and generator | 216,768 | 210,640 |
| Preceding adapter and direct request scheduling | 216,688 | 210,560 |
| Direct World entries and direct request scheduling | 208,720 | 202,592 |

An additional experiment cached receiver-bound cast and skill callbacks.
That increased the checked span by 384 bytes in each affected request
relative to the direct World entries, so the adapter keeps its existing
callback lookup.

## Reproduction

Run the pinned native proc course on the preceding and repaired installations.
Keep their complete output directories. Each bundle has a recorded hash and an
independently checked Node reconstruction.

The [existing stack diagnostic](native-stack-investigation.md) produces a
verified instrumented driver directory. Supply it and the two proc directories
to the per-request comparison.

```text
node scripts/compare-native-proc-stack.mjs --instrumented <stack-diagnostic-directory> --before <preceding-proc-directory> --after <repaired-proc-directory>
```

The comparison verifies the pinned instrumentation and records checked stack
spans separately for all 330 requests. It first requires exact frozen gameplay
observations under the diagnostic ceiling. It then sets a smaller diagnostic
limit between the observed old and new spans for Answering Gale. The preceding
build must fail that case while the repair reproduces its frozen row. Production
acceptance separately runs at the unchanged 256 KiB limit through all three
native consumers.

At 216,728 diagnostic bytes the old Answering Gale course overflowed and the
repaired course matched the frozen row. Each of the nine formerly failing
requests used 16,016 fewer checked bytes in the local comparison. [Windows
repair evidence](../evidence/proc-native-stack/repair-windows.json)

## Nested status observations

The next [hosted Windows run](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/41887459985) recovered Breach Bell. Eight triggered-cast observations still overflowed. Linux passed that revision. Answering Gale reached damage, knockback and status application before the recorder lost the outcome.

The native recorder now projects array entries and ordinary object properties with loops. Its earlier per-level map callbacks remained on the stack during live combat. This change keeps object getter order, sparse array holes, cycles, shared identities and literal keys such as `__proto__`. The original game observer still generates the independent expected bytes. The game and shipped runtime contain neither recording loop.

On the local diagnostic build, Answering Gale fell from 208,720 to 174,256 checked bytes. Original and installed games matched the full 328-course reference through C, C++ and .NET at the production limit. The two deliberately altered games were still detected. The separate full attack replay, game boot, renderer checks and package suite also passed locally. [Local measurements and preceding hosted failures](../evidence/proc-native-stack/snapshot-windows.json)

The [hosted replay of the recorder change](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/41892244243) passed on Windows and Linux. On each platform the original and installed games matched 379,857 numeric observations through C, C++ and .NET. Both deliberate faults were detected and every run released all tracked allocations. [Platform receipts](../evidence/proc-native-stack/snapshot-ci.json)
