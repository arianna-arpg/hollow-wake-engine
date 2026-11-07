# Complete workshop cold imports

The existing Godot 4.7.2 inventory workshop passes normal editor import on
Windows x64 and the pinned Steam Runtime 4 Linux x86_64 platform container.
Neither project starts with a `.godot` cache. The editor discovers both the
gameplay and save extensions, then the inventory courses and freshly exported,
relocated players pass. No gameplay code, native library or authored content
changed. Every member of each rebuilt editable-project archive is byte-identical
to the corresponding retained profile-view delivery.

The verifier now refuses an existing cache and records the editor-created
extension registry and complete import output. Both platforms pass the original
56-command course, 95 gear cards, support/recall workflows, 21 view assertions
and three deliberately broken view-cache checks. Fresh exports also pass the
background-save/reopen and vestige courses. [Checks](checks.json) link the raw
workflow, export and fault receipts, unchanged runtime hashes and final tool
source hashes. The TypeScript check passes; the runtime was not changed, so this
checkpoint does not claim a new full-SDK test run or performance measurement.

Two deliberately broken installations are rejected on each platform: an archive
with a preseeded editor cache and one without its native gameplay library. The
Windows missing-library import reports native/script errors and then reaches
the 120-second process limit. That is a failed import, not a normal engine exit.
Captured output is retained on timeouts. Linux rejects the missing library at
the ordinary error check. Its earlier observer recorded the library basename;
the retained output also satisfies the final portable extension-path predicate.

The first Windows export passed its gameplay checks but exposed a cleanup bug:
a generated 275-character editor filename caused `FileNotFoundError`, which the
cleanup helper incorrectly treated as an absent root. The root still held 121
files / 281,738,827 bytes. The diagnostic and guarded recovery are retained.
Cleanup now uses extended absolute Windows paths and only accepts a missing root
when the root is actually gone. Regression checks exercise long paths after both
successful and failed work, plus an injected missing-child error. The final fresh
Windows export leaves no fixture behind. Linux cleanup checks also pass.

Reproduce with the existing verified platform delivery and tool/native receipts:

```text
python -I -B scripts/check-background-workflows.py EDITOR DELIVERY_DIRECTORY SCRATCH OUTPUT_JSON --profile-views
python -I -B scripts/verify-background-workshop.py TOOLS_JSON NATIVE_RECEIPT DELIVERY_DIRECTORY SCRATCH FRESH_OUTPUT_DIRECTORY
python -I -B scripts/check-godot-import-faults.py EDITOR DELIVERY_DIRECTORY SCRATCH OUTPUT_JSON
python -I -B scripts/test-workshop-cleanup.py SCRATCH
```

Use fresh output paths. The fault checker retains adjacent raw logs even when
its observer fails; its JSON receipt is written only after all checks pass.
The `--direct-registration` diagnostic path is excluded from this acceptance.
Development observer failures included an overlong nested ZIP fixture and
platform differences in native-library error paths; neither counted as a pass.

This closes the normal-import gap for these desktop archives. Physical Steam
Deck/mobile hardware, ARM, Steam client launch, rendered-frame budgets and the
remaining gameplay/engine integrations remain open. The original Linux
performance measurements still used explicit registration; they are not relabeled.
Temporary exports are reproduction outputs, not additional retained downloads.
The prior [deliveries](../profile-views/deliveries.json) remain authoritative.

[Cleanup](cleanup.json) records removal of the owned scratch directory and the
earlier long-path leftovers: 270 remaining files / 517,268,617 bytes. Successful
fixture contexts had already removed their own installations. No new worktrees
or large delivery folders remain; prior deliveries and existing worktrees were
preserved. Docker was returned to its initially stopped state.
