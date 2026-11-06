# Crafting in Godot
# Equipment inspection

`inspect_item(item)` accepts a saved item from any location. The first query
loads the packaged display vocabulary. The reply contains the rolled card,
own defenses, combat modifiers, level requirement and triggered effects.
`compare_items(candidate, worn)` returns ordered changes for a swap.
Both operations work without opening a player profile and use no random stream.
Skill gems, memory pouches and character-dependent prices have separate UI rules.

Copy `addons/hollow_wake` from this platform's archive into a fresh Godot 4.7.2
project. It contains crafting, progression, their full definitions, one desktop
native extension and its licenses. Each session starts independently. For exports,
include the raw assets `*.json,*.txt,*.md` in **Resources → non-resource export
filter**. Preserve any existing installation or custom files before updating.

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
