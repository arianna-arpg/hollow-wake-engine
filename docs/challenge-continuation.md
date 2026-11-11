# Challenge continuation

Optional entry: `@hollow-wake/engine/combat/challenge-continuation`.
`copyChallengeState(source, destination, mapping)` copies controller-owned state
into an already detached host graph and returns the destination controller.
Ordinary combat continues to use `combat/challenges`.

The copy preserves cast identity relationships, captured readiness, generations,
orbit target ledgers, in-flight landings, active devices, pursuers and delayed
aftershock echoes. It preserves absolute deadlines, including infinite sentinel
values. It does not replay casts, consume randomness, advance time or call host
effects. An interrupted retirement can leave a retired state in the active map;
that observed condition is retained rather than silently repaired.

## Host contract

Supply a fresh destination bound to the detached host context, complete enumerable
`actors` and `skills` identity maps, and synchronous `spec`, `point` and `delivery`
copy callbacks. Actor IDs, skill-definition IDs, action-bar order and captured
`challengeHost` relations must match. Mapping values must be detached and distinct.
The destination cannot previously have owned a challenge or received an import,
even if it has since been cleared or the previous import was empty.

Include every retained external skill handle, including retired casts no longer
present in the world's carrier lists. The controller cannot enumerate a weak
map or detect an omitted external handle. Active controller references must also
be present in the maps. Recognized retired casts stay recognized after copying.

Callbacks must preserve values and aliases across the host graph, return new roots
and detach mutable data. The service memoizes repeated roots. Distinct point,
policy or delivery roots cannot collapse into one copy; point coordinates must
match exactly. Immutable authored rows may remain shared inside copied roots when
the host's content contract allows it. A plain JSON round-trip cannot preserve
this graph, its identities or its infinite deadlines.

Hosts remain responsible for complete actor internals, status entries, stat
contexts, carrier ownership, callbacks and the matching clock/random context.
The service checks selected visible relationships and obvious shared mutable
containers; it does not certify arbitrary actor internals or copy a World.
Copying only the controller while its host ports still point at live state is
not an isolated continuation.

All validation and copying finish before the destination's owned state is
installed. A failed preparation leaves that state unchanged. Callbacks are trusted
and must not mutate either controller or either host; their external side effects
cannot be rolled back. The internal symbol bridge is not a public package entry
or an authorization boundary. No combat update invokes the copying service.

## Verification

After installing dependencies, preparing the pinned reference and building:

```sh
npm run test:challenge-continuation-package
npm run reference:challenge-continuation
npm run adapter:challenge-continuation
npm run adapter:challenges-composed
```

Installed-package contracts cover 31 cases, eight negative type examples and
12 deliberate faults. The same contracts execute against a browser-target bundle
inside an isolated Node VM with forbidden host globals, ambient time and random
sources. This does not launch a rendered browser.

The original-only reference contains 13 frozen lifetime and scheduling
observations. Normal checks compare those observations without regenerating
them. The installed game also runs five copied-state scenarios and 30 stages,
detects six integration faults, and verifies a restored control. These closed
fixtures explicitly admit their actor/carrier shapes. Fresh disposable simulation
worlds reset the original actor-ID mint at episode boundaries so future births
can be compared; this is not a production allocator or private character factory.

The composed command also checks those cases alongside the existing 61 challenge
observations, all three game type configurations and 25 paired combat episodes.
Its original-controller control replaces only the two challenge implementation
files inside the otherwise identical assembled SDK adapter.

## Loading and remaining boundaries

The ordinary controller/content group retains its 20 KiB emitted-code and 12 KiB
browser-bundle limits, including the internal copy bridge. The copying module has
its own 8 KiB emitted-code limit and is absent from ordinary loading. The installed
controller-plus-copy bundle has an 18 KiB browser limit. Earlier package limits
remain unchanged; these are code-size limits, not CPU or allocation measurements.

Complete private character construction, durable acknowledgement-time publication,
native engine package exposure and Steam Deck/older-mobile measurements remain
separate acceptance work. The SDK does not claim those capabilities from this
component test.
