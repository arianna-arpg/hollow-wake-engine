# Workshop support sockets

Open the Godot example and choose **Support sample**, or launch it with
`-- --support-sample`. Learn Firebolt from the
pack, select Teeming Vein, choose its learned seat and press **Socket support**.
The first vacancy receives the gem. On the **Skills** tab, choose an occupied
socket and press **Remove support**. A carried skill gem offers the same removal
control. The sample has its own SQLite save.

## JavaScript

Import `WorkshopSupports` from `@hollow-wake/engine/skills/workshop-supports`
and pass an instance as the third argument to `CraftingSession`. It includes the
learned rack. The optional `@hollow-wake/workshop-support-fit` package contains
the matching portable rule code, a page index and the authored records. Hosts
own their file access. A reader requests the exact UTF-8 range and checks the
digest the loader computed. It retains four parsed pages per reader.

~~~js
const rack = save.state.rack ?? [];
const seats = fit(rack.map(row => row?.gem ?? null), looseItem.gem);
const chosen = seats.find(row => row.skillId === skillId);
const reply = session.command({
  op: 'socket-support', profile, uid: looseItem.uid, skillId,
  fits: chosen?.fits === true, hold: null
});
~~~

An authoritative host supplies the fit verdict for the exact loose item and
current skill, plus any discipline hold. The Godot profile coordinator checks
the displayed revision and seat identity. It can reuse one immutable verdict
for the same bag UID and saved revision. Check `result.changed` for the gameplay outcome and
`result.needsSave` for the persistence decision. Commit against the observed
revision. A full pack refuses removal after minting the attempted item ID.
Successful removal transfers the original support level, lock and rolls into a
fresh wrapper. Loose and socketed copies have a single owner at every commit.

`unsocket-support` takes `profile`, `skillId`, `index`, `supportId` and
`hold`. Include the skill wrapper's `uid` when removing from a bag item.
The expected support ID protects against a stale socket selection. Learned
edits report actor recalculation and `resync-supports` with the skill ID for
hosts with live summons. Stored removal touches the bag. For gear-derived
skills and temporary actor grafts, the lower-level [support rules and custody
ports](support-rules.md) accept the acting world's complete live instances.

## Content and verification

The page compiler copies the authored skill and support records and the
monster skill and grant lists used by summon crews. It builds a separate
renderer-free evaluator from hash-checked files in the pinned source.
It resolves current tree overrides, component attacks, current sockets,
rolled cuts and possible crew skills on demand. Godot starts the evaluator on
the first occupied-bar compatibility query. The pack, inventory editor and
empty-bar path can operate without starting this second runtime.

The native evaluator can also reuse the individual immutable definitions
consulted by the last query. This set is capped at 128 records and 256 KiB
of covering source pages. Changing a tree pick or support roll recalculates
the verdict. The profile's one-entry verdict cache is scoped to the exact
saved revision and loose item.

The original-game matrix covers every one of the 954 skills paired with
457 supports. A second original capture varies the seated supports, picks
a skill-tree node where available and tries alternate rolled cuts. Tests check
the independent reader and exercise the packaged Godot controls, stale writers,
damaged pages and reopened SQLite custody. [Evidence](../evidence/workshop-supports)

~~~sh
npm run build
node scripts/reference-workshop-supports.mjs
node scripts/test-workshop-supports.mjs
node scripts/verify-workshop-rack.mjs TOOLS.json VERIFIED_0.53_PROJECT.zip NEW_OUTPUT_DIRECTORY
~~~

Append `--player VERIFIED_0.53_GAME.zip` to export and check a playable game.
For a Linux build from Windows, supply the pinned Linux Godot editor before
that flag to use the offline Steam Runtime. The shipped game also accepts
`--headless -- --measure-supports`. It times first use and repeated queries
for a six-skill bar, checks every verdict, and reports page reads, CPU identity
and embedded heap use without opening a character save.
