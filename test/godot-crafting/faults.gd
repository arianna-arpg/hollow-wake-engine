extends Node
const Crafting = preload("res://addons/hollow_wake/crafting/crafting.gd")

func fail(label: String) -> void:
	print("HWE_CONTROL_FAIL:" + label)
	get_tree().quit(1)

func _ready() -> void:
	var api := Crafting.new()
	if api.start() != 0:
		fail("initialize")
		return
	var sample := api.from_portable_json("0.011704753153026104")
	if not sample.ok or api.to_portable_json(sample.value).get("text") != "0.011704753153026104":
		fail("item-roll-precision")
		return
	var clean := {"board":{"w":8,"h":8},"items":[],"equipped":{},"overflow":[],"essences":{},"account":{"craftLore":{},"ledger":{},"features":[],"progression":true}}
	if not api.open_profile(1,7,clean).ok:
		fail("open")
		return
	var ring := api.forge(1,{"baseId":"ring_lapis","ilvl":1,"rarity":"common"})
	if not ring.ok or ring.result.uid == null:
		fail("forge")
		return
	var counter := {"salvage":false,"bench":false,"oracle":false,"counter":true}
	var sale := api.salvage(1,ring.result.uid,counter)
	if not sale.ok or not api.snapshot(1).save.state.items.is_empty():
		fail("automatic-sale-lane")
		return
	var saved := api.from_portable_json(FileAccess.get_file_as_string("res://full-bag.json"))
	if not saved.ok or not api.restore_profile(2,saved.value).ok:
		fail("loaded-profile")
		return
	var uid: int = int(saved.value.state.overflow[0].uid)
	var taken := api.take_overflow(2,uid)
	if not taken.ok or not api.snapshot(2).save.state.overflow.is_empty() or api.snapshot(2).save.state.items != saved.value.state.items:
		fail("transfer-releases-custody")
		return
	if api.close() != 0 or api.metrics().live_blocks != 0:
		fail("close")
		return
	print("HWE_CONTROL_PASS")
	get_tree().quit(0)
