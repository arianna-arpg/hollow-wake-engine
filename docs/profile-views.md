# Versioned inventory views

The inventory workshop uses a read-only view that reuses unchanged account lore.
It still writes the complete portable document for every accepted save. This
changes the read/transport boundary, not crafting rules, save format, durability
or transaction ordering. SQLite remains the durable store; SQL normalization
would not remove the measured cost of repeatedly copying lore into the UI.

`CraftingSession.snapshotView(profileId, knownAccountVersion = 0)` returns a
detached projection and an account token. Zero requests the whole account. A
matching token replaces `view.state.account` with a null marker; the reader must
replace it with its corresponding unchanged account before treating the projection
as a complete snapshot. Keeping the field in place preserves serialization order. Tokens
belong to one session instance and are not saved or transferable between VMs.
They are unique across profiles and close/reopen within that instance. Account
replacement invalidates the token, including conservative replacement by an
account-editing operation that ultimately leaves equal values.

The ordinary `save` command remains detached and mutable. `snapshotText()`
continues to serialize the full committed state. Neither API omits lore. Views
do not execute host callbacks, alter random continuation or consume item IDs.

The Godot `snapshot_view()` wrapper reconstructs a complete, deeply read-only
snapshot. It retains only the last account and clears the cache when the VM
starts or closes. Every retained account is frozen before reuse. The inventory
profile publishes this view only after the durable transaction succeeds; failed
and stale writes still reload the durable owner. Mutable `snapshot()` is unchanged.

The minified base workshop ceiling is 101 KiB (previously 100 KiB), and the
unminified session module has a 22 KiB ceiling. The overlay and package receipts
record actual sizes. The separate browser bundle remains under its existing
100 KiB limit. These are explicit code-size costs, not memory or frame-time guarantees.

The exported-player runner compares synchronous saving, the accepted background
implementation, the candidate and a repeated unchanged control in balanced order.
It uses four-item and 128-item/3,929-lore profiles, verifies exact SQLite documents,
UID/RNG continuation and reopened ownership, and retains individual samples.
Main-thread time includes action calls, serialization, polling and UI methods;
it excludes GPU rendering. API/phase measurements are nested and must not be added.
The account-view tests also exercise stale tokens, detached replies, VM restarts,
numeric precision and deliberately broken cache implementations.

Reproduce after `npm run verify`:

```text
node scripts/build-profile-view-overlay.mjs FRESH_OVERLAY_DIRECTORY
python -I -B scripts/verify-background-workshop.py TOOLS_JSON NATIVE_RECEIPT DONOR_DIRECTORY SCRATCH DELIVERY_DIRECTORY --crafting-addon OVERLAY_DIRECTORY
python -I -B scripts/check-background-workflows.py EDITOR DELIVERY_DIRECTORY SCRATCH OUTPUT_JSON --profile-views
python -I -B scripts/measure-profile-saves.py TOOLS_JSON DONOR_DIRECTORY examples/godot-inventory/profile.gd SCRATCH OUTPUT_JSON --pairs 18 --candidate-addon OVERLAY_DIRECTORY
```

Use fresh outputs and stop other heavy work before measuring. The original
Linux measurements used explicit registration; subsequent [cold-import checks](../evidence/godot-cold-import/README.md)
verify the same workshop through normal editor import on both desktop platforms.
Physical Steam Deck/mobile measurements, ARM packages and complete
rendered-frame budgets remain separate acceptance work. See the retained
[measurement evidence](../evidence/profile-views/README.md).
