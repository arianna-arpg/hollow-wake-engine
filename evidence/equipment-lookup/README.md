# Cold equipment lookup qualification

`EquipmentSkills.resolve` restores an owned skill for a saved bar entry before
the first rebuild. The Hollow Wake adapter now delegates the complete original
`seatSkillById` method. Learned ownership wins, followed by an existing grant;
only matching flat modifiers from configured worn slots can create a new grant.
Cold restoration leaves item investment untouched until the normal rebuild.

The [local verification receipt](verification.json) records:

- 18 frozen original checkpoints, including actual character save/resume,
  learned/granted investment separation and item writeback;
- both the original-game adapter and the complete prepared-game pipeline,
  including all three game type configurations;
- 60 legend, 36 worn-support, 15 active passive-graft and 18,773 catalogue cases;
- ten installed runtime faults, with named assertion checkpoints and restored
  controls; the complete pipeline additionally rejects the missing passive
  handoff and passes simulation smoke and the older 4,103/8 passive courses;
- the full SDK verifier, including 1,682 passing unit tests, package checks,
  boundary checks and deliberate faults, plus the full reference verifier.

The [mechanical comparison](mechanical-proof.json) maps eight original host
references to explicit SDK ports and compares the resulting statement structure.
The original observer archive was captured before implementing the runtime.
Three later, erased non-null type annotations produce identical JavaScript;
the [type repair](../../baseline/equipment-lookup/observer-type-repair.json)
retains both source hashes and the unchanged observation hash. Normal reference
verification cannot regenerate the accepted archive.

The broad receipts preserve the exact inputs used during those runs. A subsequent
[tooling repair](tooling-repair.json) puts directly invoked reference children
inside their cleanup-owned temporary directory, and normalizes newly inserted
JSON line endings without changing JSON values. The reference, package and
completion checks were repeated for those final delivery changes. Runtime and
adapter bytes did not change after their integration checks. The final source
hashes and the earlier hashes are both retained rather than rewriting history.

The runtime module is 10,496 unminified JavaScript bytes, inside its 11 KiB
optional-module budget. It adds no runtime dependency, database query or
per-frame phase. No speedup, device performance or broader native equipment
admission is claimed. Native learned-book/bar ownership, candidate save
publication and physical-device acceptance remain separate work.

[Retention](retention.json) records cleanup and the reused worktrees. No new
worktree was created. The reference capsule, dependencies and existing work
remain available for the next extraction.

The [hosted qualification](hosted.json) independently checks both Windows 2025
and Ubuntu 24.04 artifacts from [run 42563780250](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42563780250)
at commit `99bae0f543ad06528531f0254b03185120a09f29`. Both pass the original
replays, installed faults and complete adapter course. [Anonymous public
readback](public-readback.json) matches seven published source/evidence files
byte for byte.
