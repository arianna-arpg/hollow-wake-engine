# Workshop support socket verification

In the exported inventory, choose **Support sample**, learn Firebolt, select
Teeming Vein and press **Socket support**. On the Skills tab, select that
socket and press **Remove support**. The returned gem keeps its level, lock
and rolled properties. The sample uses a separate SQLite save.

## Original-game observations

The two complete matrices in [the rule comparison](rules.json) cover 954
skills and 457 supports at source revision
`88e135e6c85d301ee7c0c3641f9fc2f92be0e140`. All 871,956 decisions
matched. Summon crews accounted for 7,246 compatible bare pairs. Adding
seated supports, rolled properties and tree choices changed 1,147 verdicts.
The original-game capture and its digest are in the
[accepted baseline](../../baseline/workshop-supports/acceptance.json).

The [custody replay](../../scripts/replay-workshop-custody.mjs) compares 18
original moves with independently opened SDK sessions, including locked
gems, discipline holds, a full pack, a stored skill, a summon crew and
another player's seat. It checks the action result, refusal text when
present, new wrapper count, bag positions and gem payloads. Run
`node scripts/test-workshop-supports.mjs` after `npm run build`.

## Exported players

The [Windows](windows.json) and [Linux](linux.json) receipts identify the
verified archives. The Linux player ran in the pinned Valve Steam Runtime
on the same i9-10900K host. Each release executable booted in both modes.
With a matching test scene it exercised pointer-driven controls, 42 rule
queries and the same final save digest on both platforms. The separate
native checks rejected a damaged content page and a stale writer. An
independent SQLite reader checked the final inventory.

On the fixed 48-query workload, retaining bounded immutable records reduced
reads from 276 to 161 and bytes fetched from 3,051,814 to 1,798,389.
Each shipping player's 65-query measurement used 14 page reads, zero new
reads for repeated identical queries, and at most 1,187,179 bytes of
embedded evaluator heap. The evaluator released all tracked bytes on exit.
Heap figures cover the evaluator; the game process also contains Godot, the
inventory runtime and native libraries.

Run the Linux release on a Steam Deck with
`./Inventory.x86_64 --headless -- --measure-supports` to collect the same
device workload. Physical Steam Deck and mobile timings remain open.
Package installation and the test commands are in the
[integration guide](../../docs/workshop-supports.md).
