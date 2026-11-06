extends Node
const Progression = preload("res://addons/hollow_wake/progression/progression.gd")
var failed := false
var assertions := 0

func check(value: bool, label: String) -> void:
	assertions += 1
	if not value:
		failed = true
		push_error(label)

func _ready() -> void:
	var host := Progression.new()
	check(host.start() == 0, "start")
	check(host.open_profile(0, 1).get("ok", false), "blank profile")
	var blank := host.snapshot(0)
	if not blank.get("ok", false):
		check(false, "snapshot initialization")
		get_tree().quit(1)
		return
	var account: Dictionary = blank.save.account
	account.credits = 1000
	account.features = ["bounty_board", "quest_giver", "reliquary"]
	account.ledger = {"deed:melee_finishes": 300, "oracle_reliquary_attuned": 1}
	account.reliquary.items = [
		{"uid": 1, "relicKey": "__proto__", "w": 6, "h": 4, "payload": {"custom": ["kept", 42]}},
		{"uid": 2, "relicKey": "overflow", "w": 1, "h": 1, "payload": {"unicode": "雪"}}
	]
	account.reliquary.stash.cells = {"__proto__": {"y": 0, "x": 0, "page": 0}}
	check(host.close_profile(0).get("ok", false), "close blank")
	check(host.open_profile(0, 1, account).get("ok", false), "host starter state")
	check(host.open_profile(1, 1, account).get("ok", false), "independent account")
	check(host.open_profile(0, 9).get("reason") == "already-open", "no implicit reset")
	var partial := host.invest(0, "feat_vendor_wares_1", 17)
	check(partial.get("spent") == 17 and partial.get("credits") == 983, "partial investment")
	var finished := host.buy(0, "feat_vendor_wares_1")
	check(finished.get("result") == true and finished.get("spent") == 43 and finished.get("credits") == 940, "finish investment")
	check(host.buy(0, "feat_vendor_wares_1").get("result") == false, "no duplicate debit")
	var earned := host.settle(0)
	check(earned.get("claimed", []).has("class_spellblade"), "earned class")
	check(host.acknowledge(0, "class_spellblade").get("result") == true, "claim class")
	check(host.acknowledge(0, "class_spellblade").get("result") == false, "claim once")
	var storage := host.buy(0, "relic_stash_2")
	check(storage.get("result") == true and storage.get("spent") == 40, "buy storage")
	var stored: Dictionary = host.snapshot(0).save.account.reliquary
	check(stored.stash.pages == 2 and stored.stash.cells.overflow.page == 1, "place overflow")
	# Godot JSON decodes every number as a float. Normalize the expected host
	# dictionary through the same documented JSON representation before comparing.
	var expected_items: Array = JSON.parse_string(JSON.stringify(account.reliquary.items, "", true, true))
	check(stored.items == expected_items, "opaque JSON payload retention")
	check(typeof(account.reliquary.items[0].uid) == TYPE_INT and typeof(stored.items[0].uid) == TYPE_FLOAT, "JSON numeric representation")
	check(stored.items.size() == 2 and stored.items[0].uid == 1 and stored.items[1].uid == 2, "item identity retention")
	check(stored.items[0].payload.custom == ["kept", 42.0] and stored.items[1].payload.unicode == "雪", "independent payload values")
	var power := host.buy(0, "reliquary_power_1")
	check(power.get("result") == true and power.get("spent") == 25, "buy power")
	var first := host.buy(0, "memory_discovery")
	check(first.get("result") == true and first.get("spent") == 30 and first.get("draws") == 1, "memory reward")
	check(host.snapshot(1).save.account.credits == 1000 and host.snapshot(1).save.random.draws == 0, "profile isolation")
	var saved: Dictionary = host.snapshot(0).save
	var file := FileAccess.open("user://progression-checkpoint.json", FileAccess.WRITE)
	check(file != null, "open isolated save")
	var portable := host.to_portable_json(saved)
	check(portable.ok, "encode disk checkpoint")
	file.store_string(portable.text)
	file.close()
	var loaded := host.from_portable_json(FileAccess.get_file_as_string("user://progression-checkpoint.json"))
	check(loaded.ok, "decode disk checkpoint")
	var restored: Dictionary = loaded.value
	check(restored == saved, "disk round trip")
	var resumed := Progression.new()
	check(resumed.start() == 0 and resumed.restore_profile(2, restored).get("ok", false), "restore fresh native host")
	var continuations: Array = []
	for step in range(10):
		var expected := host.buy(0, "memory_discovery")
		var observed := resumed.buy(2, "memory_discovery")
		check(observed == expected and observed.get("result") == true, "random continuation " + str(step))
		continuations.append(observed.receipt)
	check(host.snapshot(0).save == resumed.snapshot(2).save, "same continued account")
	var before: Dictionary = resumed.snapshot(2).save
	check(not resumed.request({"op": "invest", "profile": 2, "id": "memory_discovery", "amount": -1}).get("ok", true), "negative investment")
	check(not resumed.request({"op": "buy", "profile": 2, "id": "memory_discovery", "price": 0}).get("ok", true), "no price override")
	check(resumed.snapshot(2).save == before, "invalid requests preserve state and RNG")
	var wrong: Dictionary = before.duplicate(true)
	wrong.content = ["different revision"]
	check(resumed.restore_profile(3, wrong).get("reason") == "content-mismatch", "content contract")
	check(resumed.snapshot(3).get("reason") == "not-open", "failed restore occupies no handle")
	wrong = before.duplicate(true)
	wrong.account.credits = -1
	check(not resumed.restore_profile(3, wrong).get("ok", true), "corrupt save rejected")
	check(not host.catalogue(0, 0, 65).get("ok", true), "catalogue capacity")
	check(resumed.observe(2, 99, 9007199254740991, {"literal": 9007199254740991}, []).get("ok", false), "safe integer boundary")
	check(resumed.snapshot(2).save.account.credits == 9007199254740991, "JSON number precision")
	check(resumed.restore_profile(3, resumed.snapshot(2).save).get("ok", false), "large integer restore")
	var exact_integer := str(int(resumed.snapshot(3).save.account.credits))
	check(exact_integer == "9007199254740991" and resumed.close_profile(3).get("ok", false), "large integer continuation exact")
	check(not resumed.observe(2, 99, 9007199254740992, {}, []).get("ok", true), "unsafe integer rejected")
	var before_invalid := resumed.snapshot(2)
	check(resumed.request({"op":"save", "profile":2, "bad":{1:Vector2.ZERO}}).get("reason") == "invalid-json", "unsupported Variant refused")
	check(before_invalid == resumed.snapshot(2), "lossy data refusal leaves profile unchanged")
	var admitted_large_profiles := 0
	for payload_length in [129000, 130000, 131000, 131050]:
		var large: Dictionary = account.duplicate(true)
		large.reliquary.items = [{"uid": 12, "relicKey": "payload", "w": 1, "h": 1, "payload": "x".repeat(payload_length)}]
		large.reliquary.stash.cells = {"payload": {"page": 0, "x": 0, "y": 0}}
		var admission := resumed.open_profile(3, 1, large)
		if admission.get("ok", false):
			admitted_large_profiles += 1
			var large_save := resumed.snapshot(3)
			check(large_save.get("ok", false), "admitted large profile can save")
			check(resumed.restore_profile(4, large_save.save).get("ok", false), "large save fits restore envelope")
			check(resumed.snapshot(4).save.account.reliquary.items[0].payload.length() == payload_length, "large payload retained")
			check(resumed.close_profile(3).get("ok", false) and resumed.close_profile(4).get("ok", false), "retire large profiles")
		else:
			check(admission.get("reason") == "json-limit", "explicit large-profile refusal")
			check(resumed.snapshot(3).get("reason") == "not-open", "quota refusal occupies no handle")
	check(admitted_large_profiles > 0, "large round trips actually executed")
	var escaped: Dictionary = account.duplicate(true)
	escaped.reliquary.items = [{"uid": 12, "relicKey": "payload", "w": 1, "h": 1, "payload": String.chr(1).repeat(90000)}]
	escaped.reliquary.stash.cells = {"payload": {"page": 0, "x": 0, "y": 0}}
	check(resumed.open_profile(3, 1, escaped).get("reason") == "json-byte-limit", "escaped bytes obey wire limit")
	check(resumed.snapshot(3).get("reason") == "not-open", "wire refusal occupies no handle")
	escaped.reliquary.items[0].payload = "quote\"slash\\" + String.chr(1) + "\n雪😀"
	check(resumed.open_profile(3, 1, escaped).get("ok", false), "control and Unicode text accepted")
	check(resumed.restore_profile(4, resumed.snapshot(3).save).get("ok", false), "control text save restored")
	check(resumed.snapshot(4).save.account.reliquary.items[0].payload == escaped.reliquary.items[0].payload, "control and Unicode text retained")
	check(resumed.close_profile(3).get("ok", false) and resumed.close_profile(4).get("ok", false), "retire text profiles")
	var total := 0
	var offset := 0
	while true:
		var page := host.catalogue(0, offset, 64)
		check(page.get("ok", false) and page.rows.size() <= 64, "paged catalogue")
		total += page.rows.size()
		offset += 64
		if offset >= page.total:
			check(total == page.total, "complete catalogue")
			break
	for profile in range(3, 10):
		check(resumed.open_profile(profile, profile).get("ok", false), "fill bounded profiles")
	check(resumed.open_profile(10, 10).get("reason") == "profile-limit", "profile limit")
	check(resumed.close_profile(9).get("ok", false) and resumed.open_profile(10, 10).get("ok", false), "capacity recovery")
	check(host.close() == 0 and resumed.close() == 0 and resumed.close() == 0, "close hosts")
	check(host.snapshot(0).get("reason") == "native-host", "closed host refuses requests")
	var metrics := host.metrics()
	var resumed_metrics := resumed.metrics()
	for current in [metrics, resumed_metrics]:
		check(current.live_bytes == 0 and current.live_blocks == 0, "all tracked allocations released")
		check(current.peak_bytes > 0 and current.peak_bytes <= 32 * 1024 * 1024, "embedded heap cap")
	print(JSON.stringify({"passed": not failed, "assertions": assertions, "partial": partial, "finished": finished, "storage": storage, "power": power,
		"first": first, "continuations": continuations, "catalogue_total": total, "large_profiles": admitted_large_profiles, "exact_integer": exact_integer, "metrics": metrics, "resumed_metrics": resumed_metrics}))
	get_tree().quit(1 if failed else 0)
