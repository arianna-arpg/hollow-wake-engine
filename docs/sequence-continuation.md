# Attack sequence continuation

Optional entry: `@hollow-wake/engine/combat/attack-sequence-continuation`.
`copyAttackSequenceState(source, destination, mapping)` transfers controller-owned
continuation into an already detached host graph. It returns the destination.
Ordinary combat users continue to import `combat/attack-sequences`.

This operation preserves active and externally retained casts, hit variants,
receipts, cycle buffs, recovery markers, scheduled repeats, deferred contacts and
projectile clock banks. It does not replay casts or advance time. Host effects,
body allocation and durable character publication remain separate responsibilities.

## Host contract

Supply a fresh destination controller bound to the private host context, plus
complete enumerable `actors`, `skills`, `projectiles` and `buffs` identity maps.
Their values must be detached, distinct identities. Actor IDs, skill definition
IDs, bar order and payload, owner, projectile and buff aliases must be retained.
The destination cannot have prior work or a prior import, even an empty import.

The `spec` and `aim` callbacks must synchronously copy mutable data while preserving
aliases across the admitted host graph. They must not mutate either controller or
the live graph. Repeated identities are memoized by the service. Copying the
controller's collections is insufficient if host objects or ports still refer to
live state. The game fixtures admit selected graph shapes explicitly; they are
diagnostic courses, not a general actor or world clone.

The host must enumerate retained external skill and projectile handles, including
completed casts and retired payloads. A weak map cannot reveal unenumerated keys.
The SDK cannot discover omissions in externally retained handles. Authored content
may remain shared when the host's content contract makes that safe; mutable runtime
state must remain private.

All fallible mapping finishes before destination state is installed. A mapping
failure leaves destination controller state untouched. External effects performed
by a mapping callback cannot be rolled back. An internal unique-symbol bridge
connects the controller and optional service; it is not a public package entry or
an authorization mechanism.

## Verification

After `npm ci`, `reference:prepare`, `reference:install` and `build`, run:

```sh
npm run test:sequence-continuation-package
npm run reference:sequence-continuation
npm run adapter:sequence-continuation
npm run adapter:sequence-continuation-composed
```

The package course checks 26 independent contracts through installed Node and
browser consumers, nine negative type examples and ten deliberate faults. The
browser refuses ambient clocks, randomness and host globals. Normal tests never
regenerate accepted observations.

Four frozen original courses contain 28 observations and 22 original fault
checks. The installed game repeats those observations and twelve private contexts
with seventy stages, detects 22 integration faults, then restores the control.
The complete adapter checks game, launcher and simulation types and compares 25
paired combat episodes. Both sides use the same assembled adapter; only the
controller is replaced with its frozen published predecessor for the control.
That predecessor is compiled from accepted source and checked against recorded
output hashes, so changing the current build cannot silently change both sides.

## Size boundary and remaining work

The ordinary emitted module group is 27,156 bytes against a 32 KiB limit. The
optional copying module is 7,236 bytes against an 8 KiB limit. Installed browser
bundles measure 13,644 bytes for ordinary control and 17,095 bytes with copying.
The ordinary bundle's dependency graph excludes the optional copying module.
These are compiler/package size observations, not CPU, allocation or physical
device results. No combat tick invokes the copying service.

The bridge adds 1,282 bytes to ordinary loading and has a separate 2 KiB growth
bound inside the 32 KiB sequence limit. A source comparison requires all existing
controller members to match the frozen predecessor. Historical package totals
exclude only this verified addition and the separately bounded optional service;
their previous limits remain in place.

Full private character construction, acknowledgement-time live publication,
native-engine continuation bindings and Steam Deck/older-mobile measurements
remain open. This component contributes to those paths without claiming a
complete drop-in Unity, Godot or Unreal package.
