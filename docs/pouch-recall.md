# Recalling a memory pouch

Open **Support sample**, learn Firebolt to free a cell, select Preformed
Memory in the pack and choose **Recall memory**. Select a source group and
a facet, then confirm. The revealed gem appears in the pack immediately.
The last unit can use the retiring pouch's cell. A full pack, sealed spoils,
or a missing required facet leaves the pouch and item-ID counter intact.

## JavaScript integration

Load the authored data once. The package exports the rules and data
separately so hosts can defer loading them until the first recall.

~~~js
import { PouchRecall } from '@hollow-wake/engine/inventory/pouch-recall';
import { InventoryHost } from '@hollow-wake/engine/inventory/host';
import definitions from '@hollow-wake/engine/content/pouch-recall.json' with {type:'json'};

const rules = new PouchRecall(definitions);
const actor = rules.forActor({
  level: Math.max(zone.level, hero.level),
  all: account.unlockAllGems,
  skills: account.unlockedSkills,
  supports: account.unlockedSupports
});
const bag = {items, board, sealed: spoilsSealed, inventory: new InventoryHost(itemSize)};
const preview = actor.view(bag, pouchUid);
const move = actor.recall(bag, pouchUid, groupKey, nextUid, selectedFacet);
if (move.ok) {
  const receipts = rules.receipts(move.result, {
    ledger: account.ledger, seatLedger: session.ledger, skills: [...account.unlockedSkills],
    secondary: [...account.memorySecondary], local: seat.isLocal, progression: session.progression
  });
  // Commit move.items, move.nextUid, receipts and the existing stash in
  // one transaction against the revision displayed when the pouch opened.
}
~~~

Supply admitted bag items with unique positive IDs, one-cell gem and pouch
bases, an authoritative board mask and a globally unused next ID. The plan
shares untouched item records with the input. Treat both as immutable until
the save commits. Only a successful commit should publish the reveal and
pickup or mark the account dirty. Recreate the actor's eligibility snapshot
when its bracket or unlocks change. A saved unit retains its original
dropper, seed, terrain, rarity ceiling and any pinned reward.

The SDK accounts for seeded rough and facet draws, monster kits and tag
weights, terrain floors, rolled support cuts, retired pins, FIFO groups,
drop index counters, legendary discovery, and local lesson receipts. The
workshop supplies a local level-ten hero on open ground and starts from the
original game's fresh-account unlocks. A standalone host can supply other
brackets, sets, progression modes and seat authority.

## Reproduction

`npm run build` followed by `node scripts/test-pouch-recall.mjs` compares the
portable public API to original game draws, complete reveal panels, minted
items, bag order and ledger changes. `node scripts/reference-workshop-supports.mjs
--pouch-recall` regenerates the observations from the hash-locked original
and checks the accepted bytes. The two commands never update the baseline.

The shipped player accepts `--headless -- --measure-recall`. It checks 66
recalls against five original-game outcomes, reports first-use and warm
latency and peak evaluator heap, and exits without opening a character save.
