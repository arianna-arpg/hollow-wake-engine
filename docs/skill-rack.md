# Skill learning and removal

`@hollow-wake/engine/skills/rack` exports `SkillRackActions` and
`restoreLearnedSeatIds`. The game owns one bag, the learned-skill map and
the bar for each character. The bar and book point to the same live skill
instance. The SDK transfers the item and updates both bindings synchronously.
The optional module loads on the inventory path.

The separate [bar policy](skill-bar.md) binds and swaps existing learned or
equipment-granted instances while retaining their ownership and investment.
It also supplies the ordered rebuild handoff and account slot preferences.

```ts
const rack = new SkillRackActions(ports);
const learned = rack.learn(seat, bagItemUid);          // choose a seat
const replaced = rack.learn(seat, otherItemUid, 2);    // target seat three
const returned = rack.unlearn(seat, skillId, 0, 1);    // exact bag cell
```

Bind `unpack` and `pack` to the existing gem residence service. Supply
authoritative requirement, debt, combat-discipline, identity and placement
services. Bind the viewing hero and acting body separately for possession.
The support socket methods live in `@hollow-wake/engine/skills/support-actions`.
Use the same placements, gem allocator and game-owned actors for both services.

Learning another copy defaults to its current seat. Dropping it on a
different occupant can return two wrappers. The SDK checks each departing
skill's gates in order, removes the incoming wrapper, checks room, and
unlearns the occupant before the known copy. A room refusal returns the
incoming wrapper to its original cell at the end of bag iteration order.
When removing a learned skill, minting its wrapper precedes the placement
check. A full bag keeps the skill in the book but consumes the attempted
wrapper ID and clears derived grafts. A returned support can likewise
consume an ID on a full bag. Persist the allocator with inventory state.

Hosts supply the effects of a successful transfer. Remember the old slot and
clear flask fields before removing the book entry. Retire auras, summons and
companions after clearing the acting body's bar. Rebind grafts and restore
remembered companions downed after learning. The Hollow Wake adapter retains
these callbacks at their original positions. Keep host decisions stable
through one synchronous command. Durable storage must commit the resulting
owners together and guard against stale revisions.

### Restoring a character

Pass the saved bar IDs, the restored book's keys in iteration order, and the
configured seat count to `restoreLearnedSeatIds`. The result is a fresh array.
Short legacy bars gain vacant seats, then off-bar learned skills take the
first vacancies. Retired, duplicated and overlength bindings keep their
positions for the host's subsequent resolve-and-pad step. Hollow Wake binds
this helper only on character resume.

### Reproduction

`npm run reference:skill-rack` compares the locked original with two frozen
captures. The catalogue course learns and returns all 954 authored skill
gems. Seven additional courses cover 39 ordered actions and 20 refusals,
including guests, grants, possession, onboard crew, duplicate displacement,
flasks and remembered bonds. Six character reloads exercise locked rolled
supports, short bars, retired references, duplicates and overlength input.
Run `npm run adapter:skill-rack -- --location <prepared-game-receipt>` to
replay the observations through an isolated game with the installed package.
The negative control changes duplicate learning in a separate process and
checks that the game detects the change.

The JavaScript package and the original game's adapter expose these functions.
The 0.55 Godot workshop can learn into a chosen seat and return the skill to
the pack. The standalone character owns its eight learned seats. Games with
equipment grants, possession, companions or unlearn holds can use the lower-level
ports described above. See the [workshop save contract](inventory-workshop.md#learned-skills).
