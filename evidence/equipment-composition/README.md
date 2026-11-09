# Complete game equipment derivation

The default prepared-game adapter now composes the optional equipment skill
runtime with the existing passive adapter. It consumes the compiled passive
graft list at the original rebuild phase; it does not rediscover or cache a
different authoring view. The guarded transformation accepts the original
source or the exact prior passive transformation, preserves unrelated host
extensions and line endings, and refuses missing or late passive builds.

The runtime module itself is unchanged from the equipment extraction. Native
equipment admission and published Unity/Godot/Unreal archives are unchanged.

## Original observations and installed checks

| Course | Original-only adapter | Complete prepared game |
| --- | --- | --- |
| Equipment skill lifecycle | 60 legend and 36 worn-support observations | Same exact bytes |
| Actual passive graft lifecycle | 15 observations | Same exact bytes, with the compiled handoff |
| Equipment catalogue | 18,773 observations | Same exact bytes |
| Existing passive courses | Separate existing qualification | 4,103 rebuild and eight live authoring observations |
| Game type configurations | Three | Three |
| Simulation smoke | Separate existing qualification | Passed |
| Installed runtime faults | Five detected; restored controls match | Five detected; restored controls match |
| Disconnected compiled graft input | Not applicable | Detected at eight active-graft checkpoints; restored course matches |

The new passive course uses registered supports and real original World
rebuilds. It closes a test gap: the older rebuild fixture has no active passive
graft sources, and the older refresh course names a retired support. Those
older accepted fixtures remain unchanged. The new expected observations come
from two fresh original-game processes; ordinary verification cannot rewrite them.

`installed.json` and `composed.json` record the installed archive, source hashes,
observation hashes, fault results and cleanup. Their compressed logs retain the
actual test output. The complete route invokes `scripts/prepare-game-adapter.mjs`,
checks every installed runtime file against the built package, and reuses the
pinned tooling through separate links without installing into shared dependencies.

## Repository verification

`broad-checks.json`, `verify.log.gz` and `reference-verify.log.gz` record successful
SDK and original-reference verification. All 1,675 unit tests passed alongside
the package, boundary and deliberate-fault suites. `equipment-reference.json`
and `passive-reference.json` record fresh original replay. Package size ceilings
are unchanged; `package-budgets.json` records the optional equipment module at
9,061 unminified JavaScript bytes.

`teardown.json` qualifies success/failure cleanup and the standalone sequence
source check. Seven legacy source-check helpers now remove their owned copies
in `finally`; their assertions and transformations are unchanged. The complete
prepared-game course executes all seven. `verification.json` records their
hashes separately from the broader run and identifies the subsequent workflow
change that adds cleanup triggers and the already passing teardown check.

`gzip-hosted.json` records Windows/Linux acceptance of the preceding portable
archive-verification repair at commit
`45ed6c6b973456cd2880f6a1e9530efa36d2b017`, in
[run 42552233845](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42552233845).
That run qualifies the original-only adapter at that commit, not this new complete
composition. The earlier failing Linux run remains visible: only the gzip OS
header differed, while the uncompressed observations matched. Frozen archives
and expected observations were preserved.

## Reproduce

After installing the SDK's development dependencies and preparing/installing
the pinned reference:

```text
npm run verify
npm run reference:verify
node scripts/test-overlay-scratch.mjs
npm run test:equipment-skills-overlay
npm run test:equipment-skills-original
npm run test:equipment-skills-composed
```

The equipment workflow also runs both installed modes on Windows and Linux.
Hosted composition results are recorded separately from this local checkpoint.
No measured speedup, allocation reduction, physical Steam Deck/mobile support,
broader skill-effect execution or additional native equipment support is claimed.
