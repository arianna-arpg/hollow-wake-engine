# Experimental account progression for Godot

Copy the archive's `addons/hollow_wake` folder into a Godot 4.7.2 project.
The archive includes the desktop native extension, validated authored content,
licenses, and this wrapper. Export text and JSON assets (`*.txt,*.json,*.md`).
Only the platform named in the archive is included.

```gdscript
const Progression = preload("res://addons/hollow_wake/progression/progression.gd")
var progression = Progression.new()

func _ready():
    assert(progression.start() == 0)
    assert(progression.open_profile(0, 123).ok)
    # The host is authoritative for earned funds, milestones and roster state.
    assert(progression.observe(0, 1, 100, {}, []).ok)
    var purchase = progression.buy(0, "memory_discovery")
    if purchase.ok and purchase.result:
        print(purchase.receipt)
    var saved = progression.snapshot(0)
    var durable = progression.to_portable_json(saved.save)
    # If durable.ok, persist durable.text using the game's atomic save facility.
```

`open_profile` creates a blank account unless given a complete account object.
It does not invent starter classes or slots. Choose starter grants in the host,
or edit a blank snapshot's account and open it under a fresh profile handle.
`restore_profile` takes the complete `save` object and refuses occupied handles,
different content identities or malformed state. Close a profile explicitly
before replacing it. `close()` releases the embedded runtime; call it when done.
Use `from_portable_json(text)` on a started instance to read the saved file;
if successful, pass its `value` to `restore_profile`. These helpers preserve
fractional binary64 values that Godot's generic JSON conversion can round.

`observe` replaces the host-owned level, funds, lifetime ledger and roster as one
transaction; it preserves purchased rewards. `update_relics` accepts canonical
relic state with item identity, explicit width/height, and an opaque JSON payload.
Storage purchases retain those bodies and reconcile overflow onto new pages.
This wrapper does not perform equipment, bag transfers or item migration.

`settle` earns eligible classes; `acknowledge` accepts their pending claims.
`invest` contributes integer currency; `buy` pays the remainder. A valid request
has `ok: true` even when gameplay refuses a purchase (`result: false` or zero
investment). An unknown/malformed request has `ok: false`. Native errors require
closing and restoring a durable checkpoint; never automatically retry a purchase
whose result could not be delivered.

The paged catalogue exposes authored metadata and current gates, including
hidden entries. Your UI applies discovery presentation. It is not a secrecy or
network authorization boundary. Profile handles/seeds are uint32, all account
numbers are nonnegative safe integers, pages contain at most 64 entries, and
eight profiles share one content load. Saves retain per-profile RNG state.

This is an account/UI control interface, not a per-frame combat interface.
Transactions use detached drafts so validation/size failures cannot partially
spend funds, grant rewards or advance randomness. JSON is limited to depth 16,
32,768 nodes, 131,072 total string/key code units and 512 KiB of canonical UTF-8
JSON per command/reply; strings must be well-formed Unicode without NUL. Godot
replaces NUL on import, so encode binary/text data containing NUL before putting
it in a portable profile. The wrapper escapes other JSON control characters.
Individual sets and ledgers
are limited to 2,048 entries; relics to 512 and roster entries to 128. Content IDs
are compatibility labels, not cryptographic authentication. Durable storage,
event authority, migrations between content revisions and save authentication
remain the game's responsibility. The default 32 MiB cap bounds tracked embedded
allocations only; it excludes Godot, rendering, boundary buffers and process RSS.

Desktop editor/export verification is separate from Steam Deck, ARM/mobile,
Unity and Unreal acceptance. See the SDK's progression-session documentation for
the command contract and tests. The SDK's existing license applies.
