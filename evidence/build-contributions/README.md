# Character contribution rebuild qualification

The optional contribution runtime now orders passive/choice attributes,
conduits, worn gear, container eligibility, neighbourhood scaling and relic
power before publishing character stat sources. Its complete per-item rows feed
the existing equipment skill derivation. The guarded game adapter replaces this
phase in the pinned original `World.recalcSeat`.

The final `npm run verify` invocation passed all 109 commands and 1,745 unit
tests on unchanged inputs. [verification.json](verification.json) and its
[compressed output](verification.log.gz) record the run. The independent
original-game `reference:verify` run also passed. After that run, two verification
scripts were corrected to account separately for the optional module and to
typecheck the game before adding an older observer that calls private methods.
[reference-verification-corrections.json](reference-verification-corrections.json)
records exact reversible edits and hashes; runtime, reference observers, source
lock and reference command did not change. The final full verification and
catalogue run use the corrected scripts.

The installed SDK matches 91 frozen class/container observations across all
39 classes, 47 live-casting observations and all 18,773 worn-item catalogue
observations. Each of 127 observed contribution preparations independently
rebuilds sources from copied inputs, leaves the live character unchanged and
matches its subsequent rebuild. Ten independent contracts pass in installed
Node and hostile browser consumers; ten implementation faults and three
installed-game faults are detected, with restored controls. See
[qualification.json](qualification.json) and [catalogue.json](catalogue.json).

The optional module is 3,296 unminified bytes against a 6 KiB cap. The combined
contribution/passive/container browser bundle is 21,632 bytes against a 40 KiB
cap. Retained core code is unchanged at 86,109 bytes; its existing limits remain
enforced. These are code-size checks, not timing, allocation or device results.

[cleanup.json](cleanup.json) records removal of 78 generated workspace test
folders plus the verifier's separately cleaned temporary root. No new worktree
or large generated folder remains. Existing worktrees and original game work
were preserved. [summary.json](summary.json) binds the retained evidence hashes.

Full durable character context, account-resident relic investment authority,
granted bar admission and acknowledgement-time live reconciliation remain
integration work. This checkpoint does not expand native engine package
admission or qualify Steam Deck/mobile performance. The
[boundary contract](../../docs/build-contributions.md) describes the exact scope.

[Hosted verification](hosted.json) subsequently confirmed the exact published
`78781e56ed96599850614b747b4f5ad1c638a552` source on Windows and Linux in
[run 42686961411](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42686961411).
Both platforms reproduced the 91/47/18,773 observations and 127 isolated private
preparations, detected the deliberate faults, and replayed the original
contribution course in two fresh processes. Downloaded source/report/log hashes
were checked independently against that commit; downloaded artifacts were
removed after verification. This is platform evidence for this checkpoint,
not physical-device qualification or evidence for later source changes.
