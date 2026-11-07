# Crafting in Godot

Copy `addons/hollow_wake` from this platform's archive into a fresh Godot 4.7.2
project. It contains crafting, progression, their full definitions, one desktop
native extension and its licenses. Each session starts independently. For exports,
include the raw assets `*.json,*.txt,*.md` in **Resources → non-resource export
filter**. Preserve any existing installation or custom files before updating.

For repeated inventory reads, use `snapshot_view(profile)`. Its `save` is complete
and deeply read-only; unchanged account lore is reused internally. `snapshot()`
still returns a detached mutable save. Use `snapshot_text()` for portable storage.
The view cache resets across VM restarts and profile changes. Never use the view
as proof that a pending durable write has committed; publish it only after the
store confirms success, as the inventory workshop does.

## Inspect an inventory item

Call `inspect_item(item)` for rolled equipment and `compare_items(candidate, worn)`
for an ordered swap comparison. For an item with a gem or pouch payload, call
`inspect_cargo(item, view, fit_rows)`. All three accept detached item bodies
and need no open profile. They leave the random stream and item IDs untouched.

```gdscript
var view := {"inBag":true, "lane":"sell", "confirmMemorySale":true}
var result := crafting.inspect_cargo(item, view)
if result.ok:
    title.text = result.card.title
    details.text = "\n".join(PackedStringArray(result.card.lines))
```

Include the viewing hero's `attributes` in the view for requirement verdicts.
For a support, supply socket-gate rows in equipped-slot order. Each row
contains `slot`, `skillId`, `fits`, `sockets` and `occupied` for this cut.
An empty array means an empty bar. Omitting the argument leaves it unspecified.
The wrapper verifies and reads the necessary display pages. It keeps up to four. Use `set_cargo_page_limit(1)` to minimize retained pages. A sale quote
describes the whole transaction. The host owns confirmation and settlement.

```gdscript
const Crafting = preload("res://addons/hollow_wake/crafting/crafting.gd")
var crafting := Crafting.new()

func _ready():
    assert(crafting.start() == 0)
    var initial := {"board": {"w": 8, "h": 8}, "items": [], "equipped": {},
        "overflow": [], "essences": {}, "account": {"craftLore": {}, "ledger": {},
        "features": [], "progression": true}}
    assert(crafting.open_profile(1, 17, initial).ok)
    var minted := crafting.forge(1, {"baseId": "ring_lapis", "ilvl": 10, "rarity": "rare"})
    if minted.ok and minted.result.uid != null:
        var saved := crafting.snapshot(1)
        var portable := crafting.to_portable_json(saved.save)
        if portable.ok:
            # Give portable.text to the game's atomic save facility.
            print(saved.save.state.items.size())
```

The session owns two independent profiles per native host. `open_profile` accepts
complete state, an optional next UID and an explicit seed. `restore_profile`
accepts a complete matching `save`; it refuses occupied handles and malformed or
incompatible saves. Use `close_profile` before replacing a profile and `close`
to release the native host. UIDs belong to their profile.

Use `options` to page through affixes (at most 128 per call), `forge`/`roll` to
mint, `craft`, `socket` and `reroll` for item changes, and `lock_item`, `salvage`
or `salvage_bulk` to manage salvage. Supply all four authoritative station flags
(`salvage`, `oracle`, `bench`, `counter`) for these gated actions. The host decides
access, durable saves, presentation and downstream character recalculation. Read
`events` even for `ok: true`: insufficient payment or a refused action is a valid
gameplay outcome. An unpaid reroll can consume a random draw.

Full bags retain recovered supports in `overflow`. `recover` attempts bag placement;
`take_overflow` transfers the item out of session custody. Persist the destination
and this session as one host transaction. A native transport failure can leave
the outcome unknown; never automatically replay a payment or transfer. Close and
restore an authoritative checkpoint according to the game's recovery policy.

Commands and saves use portable JSON. Godot `StringName` keys and values, including
dot-assigned dictionary keys, cross the boundary as text. The wrapper refuses other non-string dictionary
keys, engine objects/types, cycles, nonfinite floats and unsafe integer Variants
before conversion. For durable saves use `to_portable_json(saved.save).text`;
when loading, check `from_portable_json(text).ok` and pass its `value` to
`restore_profile`. Both helpers require a started session and return a refusal
on invalid input. Ordinary Godot JSON conversion can round item rolls even with
full precision enabled. The adapter exchanges those numbers by their exact bits;
saved files remain standard JSON. NUL is excluded. Returned JSON numbers are
Godot floats: convert integer IDs explicitly where needed.
The SDK enforces its own state and request limits, including 512 KiB compact JSON.
The default 32 MiB cap applies to tracked embedded allocations per started host;
it excludes Godot, rendering and process RSS. This is a menu/control API. Desktop
replay does not establish physical Steam Deck, mobile, Unity or Unreal support.

Use `inspect_loadout(item, equipped, hero_level, "full")` for ordered
comparisons against worn pieces. Compact mode returns `hasComparison`. Pass
the viewing hero's level here. Use `equip(profile, uid, actor_level, slot)`
to commit a change with the acting body's level. Omitting the slot selects
the first empty compatible slot or the first compatible slot if all are full.
Use `unequip(profile, uid, slot)` to return a piece to the pack. Check
`result.changed` before saving and read `result.refusal.reason` when present.
Slot content loads on demand. Displaced gear that cannot fit in the bag
transfers to the profile's recoverable overflow.

## Learned skill rack

The rack-enabled build accepts version-one saves. Learning a bag gem writes
eight explicit seats in a version-two save. The first successful learn upgrades
the profile. Both versions share the same content identities and UID sequence.
Use `learn_skill(profile, uid, meets, blocked, slot)` and
`unlearn_skill(profile, skill_id, blocked)`. The host provides any current
unlearn holds by skill ID. `skill_requirements(item, attributes)` reads the
authored numeric requirements from a verified page. Commit whenever
`result.needsSave` is true, including a refused move that consumed an ID or
changed bag order. Commit the bag, rack and stash at their observed revision.

For durable storage, `snapshot_text(profile)` returns the committed profile's
portable JSON in `.text`. Use `snapshot(profile)` for a detached view. The
inventory workshop reads both in one synchronous save operation.

## Support sockets

`support_fit(rack, loose_gem_payload)` returns current seat verdicts with socket
and occupied counts. Pass the owning profile's observed verdict and discipline
hold to `socket_support`. Use `unsocket_support` with the expected support ID
and zero-based index. Supply a bag UID for a stored skill. Commit every
`needsSave` result, including a refused return that consumed an item ID.
The fit runtime and its verified data pages load on demand.
## Memory pouch recall

`pouch_request` loads the optional recall runtime and its authenticated
content on first use. The standalone profile demonstrates group and facet
selection, validating the caller's save revision, applying the resulting
bag and mint receipts together, and recovering after a competing write.
The core JavaScript package also exports these rules for other hosts.
# Vestige inlays

Use `grant_vestige(profile, id, count)` for a pickup. Use `view_inlay(item, wallet, id, socket)`
for a read-only preview and `inlay_vestige(profile, uid, id, socket)` to commit. Omit the
socket for first-empty targeting. Commit the resulting save against the revision seen
by the player. The workshop example performs the revision check and atomic write.

