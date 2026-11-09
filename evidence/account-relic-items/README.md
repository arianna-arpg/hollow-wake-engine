# Typed account relic qualification

The optional item-aware account v2 retains complete canonical relic bodies,
checks storage indexes against item content, and composes with shared-owner
prepared transactions. Legacy v1 opaque accounts retain their format.
See [the contract](../../docs/account-relic-items.md).

The full `npm run verify` passed all 111 commands and 1,770 unit tests.
`npm run reference:verify` also passed, including reproduction of the 27 new
original-only account/build checkpoints in two fresh processes. The source
hashes stayed unchanged. Reports and compressed full output are retained here.

The initial run stopped at an obsolete text target in an existing fault test.
The pending-save guard now also permits the read-only relic query. Its fault
target was updated, the same invalid-edit assertion was retained, and the full
verifier was rerun. The initial report/output are retained separately.

Installed and browser consumers pass twelve contracts and detect ten deliberate
faults, followed by restored positive controls. Public types also pass. The
account bodies and canonical board order of every captured checkpoint survive
typed save/restore. The original companion observations are future extraction
anchors; this milestone does not reproduce companion execution in the SDK.

The helper is 3576 unminified bytes. The account owner is 29225 bytes,
within an explicit 30 KiB allowance (previously 27 KiB). The combined
relic/workshop browser consumer is 168399 bytes. Earlier core and independent
consumer limits still pass. Unchanged inventory edits do not re-admit account
item bodies. These are code-size and operation-count checks, not a device
timing, allocation or compatibility claim.

[summary.json](summary.json) binds source and evidence hashes.
[cleanup.json](cleanup.json) records removal of generated test folders;
no new worktree or large generated folder remains. Existing work was preserved.
