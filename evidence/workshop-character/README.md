# Durable character context qualification

The optional workshop character record retains raw class, attribute, passive
and personal-container inputs beside the inventory. V1 saves remain unchanged;
v2 requires explicit matching support. Account property is excluded from this
character-owned record. See [the contract](../../docs/workshop-character.md).

The complete `npm run verify` run passed all 110 commands and 1,758 unit tests
with unchanged candidate inputs. [verification.json](verification.json) and
[its compressed output](verification.log.gz) retain that result. The installed
and browser qualification passes thirteen contracts and detects ten deliberate
faults, with a passing restored control. Seventy-eight frozen original class
attribute-source records survive save/restore and recompute their original
attribute values. [qualification.json](qualification.json) records the checks.

Warm commands recheck item IDs and graft-carrier links without reconstructing
the passive graph. The validator is 5,854 unminified bytes, and the combined
character/passive/workshop browser bundle is 196,055 bytes. Existing core size
and independent account-consumer limits still pass. These are operation and
code-size boundaries, not timing or physical-device measurements.

No original observer, fixture, content compiler or game adapter changed in
this milestone. This is source-context admission, not complete original-save
restoration, a full authored build provider, account relic writeback or native
v2 package admission. Those boundaries remain open.

[cleanup.json](cleanup.json) records removal of generated test folders;
no new worktree or large generated folder remains. [summary.json](summary.json)
binds the source and evidence hashes. Existing worktrees were preserved.
