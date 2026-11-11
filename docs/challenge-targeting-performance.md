# Challenge target selection

Burrowing Pursuers need one nearest target per update. Sorting every eligible
enemy did more work than this result requires. The controller now scans finite
distances once, retaining the first candidate at equal distance. It uses the
same `Math.hypot` metric: squared distances can overflow or underflow and change
the selected target. Nonfinite distances use the previous sorting path.

This changes selection only. Eligibility filtering, field-wound updates,
movement, strikes, trail timing and synchronous host effects keep their order.
The filtered enemy array is private to the update. No lookup table, cache or
additional collection is created by the finite-distance scan. Coordinates must
remain stable during synchronous selection; accessors that change positions on
read do not have a portable ordering contract. Coordinate read counts are not
part of the host contract. Exceptional comparator behavior
is compared within one runtime, not asserted to be deterministic across engines.

## Reproduction

After installing the locked development dependencies and building the SDK:

```sh
npm run test:challenges-package
npm run test:challenge-targeting
npm run reference:challenges
npm run adapter:challenges
npm run reference:challenge-continuation
npm run adapter:challenge-continuation
npm run adapter:challenges-composed
```

The package course adds eighteen targeting cases in installed Node and an
isolated browser-target bundle, including stable ties, cursor-relative distance,
large/tiny coordinates and nonfinite fallback. Five deliberate mistakes must
fail, and restored code must pass. The targeting diagnostics address the emitted
private movement method to observe selection even when coordinates prevent a hit.
Separate paired courses call the public preparation, placement and update APIs.

`baseline/challenge-targeting/previous-sdk.ts.gz` retains the controller published
at `e7761b9ecaea04a4cde8b253bee4402905b66fe7`. Its provenance records both hashes
and the shared runtime dependency. This is a previous-SDK comparator; the original
game fixtures and their accepted expected results remain unchanged. Both sources
are bundled with identical settings. Every paired course compares observations
after each of 120 updates, including actor positions, wounds, device centers,
deadlines, hit/pulse counts and aggregate effect checksums.

## Measurement scope

Stop other CPU-heavy local work before measuring:

```sh
npm run benchmark
npm run benchmark:challenge-targeting
```

The targeting report is `.artifacts/challenge-targeting-benchmark.json`; the
non-timed check writes `.artifacts/challenge-targeting-check.json`. Reports record
source hashes, runtime, CPU, tool version and each sample. Temporary bundles are
removed on success and failure. The benchmark warms each variant, alternates
measurement order over twelve rounds, and compares resulting observations after
each round. Active scenes use 900 updates per round; idle uses 90,000.

Synthetic host ports keep damage and presentation work bounded. Setup, bundling,
real damage execution, rendering, physics and engine bindings are outside the
timed region. Elapsed time establishes neither allocation volume nor a whole-game
speedup. Steam Deck and older mobile performance still need physical-device
measurements, including sustained pacing and thermal behavior. Existing 20 KiB
module and 12 KiB browser-consumer limits remain unchanged.

## Local candidate measurement

Windows x64, Node 24.9.0, Intel i9-10900K; twelve alternating rounds.
Medians use the mean of the two middle samples. Times are total milliseconds
for 900 updates, except the idle row, which uses 90,000 updates.

| Enemies | Devices | Field wounds | Previous ms | Candidate ms | Previous / candidate |
| ---: | ---: | :--- | ---: | ---: | ---: |
| 0 | 0 | No | 7.663 | 7.630 | 1.00 |
| 0 | 1 | No | 0.774 | 0.764 | 1.01 |
| 16 | 1 | No | 4.772 | 2.326 | 2.05 |
| 64 | 4 | No | 88.799 | 19.169 | 4.63 |
| 256 | 8 | No | 993.823 | 153.535 | 6.47 |
| 64 | 4 | Yes | 113.157 | 35.950 | 3.15 |
| 256 | 8 | Yes | 1259.097 | 415.228 | 3.03 |

Occupied scenes improve by about 2.1–6.5 times in this bounded workload. Idle
and empty scenes are effectively unchanged. This measurement does not replace
full regression acceptance or qualify any physical-device target.
