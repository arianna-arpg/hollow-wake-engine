# Unity account progression candidate

The development gameplay 0.4 package exposes the already-extracted
[progression session](progression-session.md) through `AccountProgression`.
Its three immutable content packs retain the original compiled-content hashes.
No gameplay policy is reimplemented in C#.

The binding owns up to eight profile handles, validates lifecycle ownership
under one lock and keeps complete saves inside the shared JSON codec. Unity's
serializer handles only small envelopes. Typed operations cover the whole
account command contract, including catalogue pages, authoritative observations
and relic replacement. Profile and relic IDs remain uint32, while account
balances and ledgers retain safe-integer values.

The six JavaScript adapter tests cover course equivalence, opaque maps,
binary64 values, continuation, routing refusals, capacity and large state.
The actual UPM course compares 104 editor/player steps with the already-qualified
SDK session, plus independent purchase arithmetic, storage placement, class
claim retirement and all 258 catalogue rows. It exercises retired-handle reuse,
owner disposal and zero tracked native allocations after closure.
This is new binding evidence, not a regeneration of original-game fixtures.

Reproduction:

~~~text
npm run build
node --test test/unity-progression-entry.test.mjs
python -I -B scripts/verify-unity-progression.py --editor EDITOR --gameplay DELIVERY --output FRESH_REPORT
~~~

The verifier installs the actual tarball, builds a Windows x64 Mono player,
moves the build before executing it, checks the native library hash and compares
complete replies outside Unity. Temporary projects and caches are removed even
on failure. Full Unity logs stay local because they contain machine/license
metadata; public observations must omit those logs.

The [accepted local checkpoint](../evidence/unity-progression/README.md) also
passes retained combat, pouch, workshop and live-equipment/storage courses,
three deliberately broken account adapters, two changed-asset controls and the
complete SDK regression. Hosted checks and public release publication remain
separate gates. Account persistence, atomic account/workshop publication,
IL2CPP, other Unity platforms and physical Steam Deck/mobile performance remain
separate work. The 32 MiB VM cap is not total engine or process memory.
