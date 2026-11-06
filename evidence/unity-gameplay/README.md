# Unity gameplay package

The UPM tarball targets Unity 2021.3 on Windows x64. Unity 2021.3.6f1
imported the local tarball through Package Manager and imported the
**Casting and Burning** sample through Unity's sample API. The player build
used its **Ruin Encounter** scene with the serialized Magician asset and
sample script. A verification driver opened the relocated Mono player,
pressed the sample's cast action and observed a completed hit.
The [release receipt](windows.json) records the archive and native library
digests, editor and player observations and measurement results.

## Rules and ownership

The package links against the installed `@hollow-wake/engine` 0.57 candidate.
Its native library comes from the [verified Windows managed package](../pouch-recall/dotnet-windows.json).
The combat entry delegates to the hash-checked [persistent session](../../experiments/embedded-js/session.mjs).
Both hosts compared every response to 60 frozen requests, including item
rolls and movement, passive choices, skill configuration, cast timing,
timed damage, snapshots and continuation of the random stream.

The pouch entry delegates to the [same local-player session](../../adapters/embedded/pouch-session.mjs)
as the Godot and .NET releases. Each Unity host compared 2,304 seeded rewards,
15 original recall actions and their 15 corresponding panels. The typed C#
test also checks an explicit facet choice, refusal without it, the complete
proposed save fields, and item IDs above 32 bits.

The combat facade checks a repeated press, an invalid restore, independent
actors and the same hit after restoring an active cast. Input-free catch-up
returns at a completed cast or defeated target so the game can act before
the next tick. The host still decides when a projectile makes contact and
when a timed effect should be applied. Twice leaving real editor Play mode
with domain reload disabled released every tracked native allocation from
an intentionally undisposed host. A separate UPM install with an altered
pouch asset refused to open it and could still open combat.

## Cost of loading and advancing

Four alternating loads through the shipped native DLL used the same rules
and 60 requests. Encoding repeated content records in a table reduced the
input from 5,351,716 to 1,755,456 bytes and peak tracked heap from
66,266,651 to 25,485,411 bytes. All responses matched in both layouts.
Pouch rules load on demand in a separate runtime. Process-wide memory and
GPU resources are outside these allocator counters.

For 512 input-free ticks, eight bounded catch-up calls produced the same
saved state as 512 individual calls. The player exchanged 1,288 versus
82,432 UTF-8 request and response bytes. The receipt includes four alternating
rounds and separate native allocation counts. Mono's per-thread managed
allocation counter returned zero even for the control. Managed allocation
volume is unmeasured. These are headless desktop tests. Physical Steam Deck
and older-mobile costs, graphics/input performance and IL2CPP remain open.

## Reproduction

Start from the verified 0.57 release directory containing the JavaScript SDK
and Windows .NET pouch ZIP. Install this repository's development dependencies
and prepare its pinned reference content. Run the following from the SDK root.

~~~text
node scripts/package-unity-gameplay.mjs RELEASE_DIRECTORY NEW_PACKAGE_DIRECTORY PYTHON_EXECUTABLE
python -I -B scripts/verify-unity-gameplay.py --editor UNITY_EXE --package NEW_PACKAGE_DIRECTORY --release RELEASE_DIRECTORY --receipt NEW_RECEIPT_JSON
~~~

The verifier creates an isolated project under `.artifacts`, uses an isolated
Unity package cache and removes its project and player on exit. The [package
guide](../../adapters/unity/README.md) covers importing the sample and using
the combat and inventory APIs from another scene.
