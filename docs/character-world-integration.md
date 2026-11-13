# Character and world integration boundary

This internal integration foundation connects a durable account/character group
to one live scene instance. Its four runtime modules have moved from the
qualification workspace into `src`. They are not public package entry points
yet: complete installed composition, stable formats and the remaining live-state
boundaries still need qualification. The character commands and their original
comparison course are now maintained; see [composition qualification](character-composition-qualification.md).
The twenty-three internal integration modules are excluded from the installable
archive, including declarations and source maps. Repository tests compile them
directly. The package gate checks this exclusion. The core and individual
optional-module size limits follow the explicit [shared-account allowances](character-command-consolidation.md).
Installed adapter and benchmark integrity checks derive their expected runtime
file list from the source package manifest, and still compare shipped bytes
against the build. The package gate independently compares that list with the
actual archive. Complete local-build snapshots continue to include internal
modules; an archive cannot define its own expected contents.

The preceding foundation revised the combined relic/workshop browser allowance from 180 to
181 KiB for the shared retained-investment admission methods and graft-validation
hook. A controlled comparison against commit `309bc590` substitutes only the
four changed shared modules into the same browser build: 184,302 bytes before
and 184,546 after (244 additional bytes; 107 additional gzip bytes). The emitted
TypeScript build measures 184,555 bytes, or 58,007 gzip bytes. The installed
consumer gate records both its measured size and the 185,344-byte limit. This
is an explicit feature allowance, not a performance improvement or a device
measurement; all behavioral and fault checks still apply.

## Shared inventory admission

The internal complete-character format now composes the maintained crafting
core, inventory carrier, bare-gem delivery codec and character validators. It
does not carry its own copy of item, support or skill-tree validation.
`CharacterResidenceData` explicitly selects structural retained-investment
validation. `CompleteWorkshopCharacterData` permits an authored passive graft
assignment to survive a temporarily unlearned skill; its item ownership and
duplicate-identity checks stay shared with the existing character loader.

The public crafting v1–v4 and character v1 loaders retain their existing rules.
A player-provided flag cannot select retained admission. The complete format is
still diagnostic: full character derivation and account ownership must succeed
before its candidate can be stored or published. The inventory carrier returns
detached state and the account-owned random stream, then closes its private
profile on success or refusal. Bare-gem delivery validation does not allocate a
dummy item or consume an item identity. Ability currency remains a separate
wallet and preserves the original finite, nonnegative fractional values.

`test/complete-inventory.test.mjs` checks these boundaries, including public-save
rejection, detached results, unknown identities, duplicate ownership and carrier
reuse. `node scripts/test-complete-inventory-faults.mjs` substitutes deliberately
broken modules in isolated child processes without rewriting source or build
output. Both are development checks; they do not establish native engine or
physical-device performance.

## Ownership

`DurableCharacterOwner` owns a fresh private account command processor. One
storage compare-and-swap covers the account, one to seven characters, owed world
deliveries, and their placement stream. The host supplies storage and content
admission; no database or filesystem dependency enters the gameplay module.
The diagnostic save identities remain unchanged during this move. They are not
a new stable save format or an implicit migration from existing game saves.

`CharacterWorldAdapter` assembles that owner with `WorldDeliveryBinding` and
`LocatedPickupFrame`. The host supplies character identity, the live publication
ports, and an `isCurrent` check for the exact scene instance. A saved world key
alone cannot establish that a departing scene is still alive.

`HollowWakeSpillPlacement` preserves the original bare-gem geometry over explicit
position, floor and collision observations. Its saved random stream belongs to
placement. Presentation jitter and the wider game's random stream remain host
responsibilities.

## Publication and recovery

The owner prepares a private candidate and an ordered command journal before
attempting storage. Reads retain the last published state while storage is
pending. On a confirmed commit, the host publishes each journal entry's inventory
changes, effects and pickup retirement in their original order. Final world
reconciliation uses the prepared candidate, before the owner's readable snapshot
advances. Replacing this sequence with a final snapshot assignment loses
intermediate game behavior.

A known storage refusal discards the prepared live lease. Conflicts, uncertain
commit acknowledgements and failed live publication require recovery through a
fresh owner and scene adapter. A scene may retire while storage is pending; that
prevents later publication into the old scene but does not roll back storage.
Discard and recovery notifications must still run after retirement.

Live preparation, publication, discard, restoration and eligibility callbacks
are synchronous. The eligibility callback expires when its update returns, even
if the caller retains it. Disposing the adapter releases its owner, frame,
binding and host options. A pending operation retains its own lease until it
settles.

## Current verification

The maintained consolidation course preserves all 343 assertion groups from the
accepted account/character/World course, with additional ownership and malformed
entry checks. Two fresh controls produce the same observation sequence; four
deliberate account/entry faults are rejected and the restored control passes.
Its fixtures, original-only generators and test hosts now live in the repository.
The complete installed-package path remains a separate release requirement.

These standalone checks now use maintained source directly:

- `node scripts/test-character-world-types.mjs`: four positive fixtures and 32
  compiler-rejected calls, including asynchronous publication and foreign handles.
- `node scripts/test-character-world-lifetime.mjs`: disposal releases the scene
  and owner while the adapter and an expired callback remain reachable; two
  deliberate retention faults are rejected.
- `node scripts/test-character-world-browser.mjs`: placement, reconciliation and
  frame authority run from a browser-target bundle with hostile ambient globals.
  The assembled owner is exported here; its full lifecycle belongs to the
  complete course above. This is not an actual browser or physical-device run.

The combined four-module bundle is 22,315 minified bytes in the recorded local
check. This measures code size, not frame time, peak memory or Steam Deck/mobile
performance. Device qualification and the full installed-package path remain
required.
