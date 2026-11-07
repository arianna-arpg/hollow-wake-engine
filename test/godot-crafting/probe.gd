extends Node

const Crafting = preload("res://addons/hollow_wake/crafting/crafting.gd")
const Progression = preload("res://addons/hollow_wake/progression/progression.gd")
var assertions := 0

func check(ok: bool, label: String) -> bool:
	assertions += 1
	if not ok:
		push_error(label)
		get_tree().quit(1)
	return ok

func through_wrapper(host, r: Dictionary) -> Dictionary:
	var p := int(r.profile)
	match r.op:
		"open": return host.open_profile(p, r.seed, r.state, r.get("nextUid"))
		"save": return host.snapshot(p)
		"restore": return host.restore_profile(p, r.save)
		"close": return host.close_profile(p)
		"options": return host.options(p, r.uid, r.offset, r.limit)
		"mint": return host.forge(p, r.options) if r.kind == "forge" else host.roll(p, r.options)
		"craft": return host.craft(p, r.uid, r.affixId, r.score, r.access)
		"socket": return host.socket(p, r.uid, r.access)
		"reroll": return host.reroll(p, r.uid, r.index, r.score, r.access)
		"lock": return host.lock_item(p, r.uid, r.on, r.access)
		"salvage": return host.salvage(p, r.uid, r.access, r.get("lane"))
		"salvage-bulk": return host.salvage_bulk(p, r.category, r.access, r.get("lane"), r.get("rarity"))
		"recover": return host.recover(p, r.uid)
		"take-overflow": return host.take_overflow(p, r.uid)
	return {"unexpected_operation": r.op}

func extensions(host: RefCounted) -> bool:
	if not check(host.close_profile(1).ok and host.close_profile(2).ok,"retire legacy profiles"):return false
	var state:={"board":{"w":4,"h":4},"items":[],"overflow":[],"equipped":{},"essences":{},"account":{"features":[],"ledger":{},"craftLore":{},"progression":true}}
	if not check(host.open_profile(1,17,state).ok,"extension profile"):return false
	var minted:Dictionary=host.forge(1,{"baseId":"helmet_armor","ilvl":1,"rarity":"common","sockets":2,"quality":0.5})
	if not check(minted.ok,"extension gear"):return false
	var view:Dictionary=host.snapshot_view(1)
	if not check(view.ok and view.save.is_read_only() and view.save.state.account.is_read_only(),"readonly view in built addon"):return false
	var quote:Dictionary=host.station_view(1,minted.result.uid)
	if not check(quote.ok and quote.socket.count==2 and quote.socket.cost=={"essence":"brilliant","count":6.0},"station quote in built addon"):return false
	if not check(host.grant_vestige(1,"morren",1).result.get("changed",false),"vestige grant in built addon"):return false
	var saved:Dictionary=host.snapshot(1).save
	var preview:Dictionary=host.view_inlay(saved.state.items[0],saved.state.vestiges,"morren")
	if not check(preview.ok and preview.preview.changed and preview.preview.index==0,"vestige preview in built addon"):return false
	if not check(host.inlay_vestige(1,minted.result.uid,"morren").result.get("changed",false),"vestige inlay in built addon"):return false
	var inlaid:Dictionary=host.snapshot(1).save
	if not check(inlaid.state.items[0].sockets==["morren",null] and inlaid.state.vestiges.morren==0,"vestige payment in built addon"):return false
	if not check(host.close_profile(1).ok and host.restore_profile(1,inlaid).ok and host.snapshot(1).save==inlaid,"extension save roundtrip"):return false
	return true

func _ready() -> void:
	var requests: Array = JSON.parse_string(FileAccess.get_file_as_string("res://requests.json"))
	if not check(requests.size() == 56, "complete retained course"): return
	var host := Crafting.new()
	if not check(host.start() == 0, "initialize full crafted content"): return
	var numbers: Array = JSON.parse_string(FileAccess.get_file_as_string("res://numbers.json"))
	for vector in numbers:
		var exact_number := host.from_portable_json(vector.json)
		if not check(exact_number.ok, "valid decimal vector"): return
		var bytes := PackedByteArray()
		bytes.resize(8)
		bytes.encode_double(0, exact_number.value)
		if not check(bytes.hex_encode() == vector.bits, "native Godot double matches independent IEEE bits"): return
		var formatted := host.to_portable_json(vector.bits.hex_decode().decode_double(0))
		if not check(formatted.ok and formatted.text == vector.json, "native Godot double produces canonical text"): return
	if not check(not host.from_portable_json("[1,]").ok and not host.from_portable_json('"\\u0000"').ok, "malformed or nonportable file refused"): return
	var opaque := {"~field":["~f0000000000000000", "~~", "~", String.chr(1) + "雪😀"], "__proto__":0.125}
	var opaque_text := host.to_portable_json(opaque)
	if not check(opaque_text.ok and host.from_portable_json(opaque_text.text).get("value") == opaque, "wire-like user strings and opaque keys survive disk format"): return
	var checkpoint: Dictionary = {}
	var recovered: Dictionary = {}
	var kinds := {}
	var observations := FileAccess.open(OS.get_environment("HWE_GODOT_OBSERVATIONS"), FileAccess.WRITE)
	if not check(observations != null, "open test observations"): return
	for i in range(requests.size()):
		var parsed := host.from_portable_json(requests[i])
		if not check(parsed.ok, "original command decoded %d" % i): return
		var reply := through_wrapper(host, parsed.value)
		var observation := host.to_portable_json(reply)
		if not check(observation.ok, "capture command %d (%s)" % [i,parsed.value.op]): return
		observations.store_line(observation.text)
		kinds[parsed.value.op] = true
		if reply.has("save"):
			var saved: Dictionary = reply.save
			if checkpoint.is_empty() and saved.state.items.size() == 128 and saved.random.draws > 0:
				checkpoint = saved
			if recovered.is_empty() and saved.state.overflow.size() == 1 and saved.state.items.size() == 2:
				recovered = saved
	observations.close()
	if not check(not checkpoint.is_empty() and not recovered.is_empty() and checkpoint.state.account.craftLore.size() == 3929, "loaded and overflow checkpoints"): return
	var file := FileAccess.open("user://crafted-checkpoint.json", FileAccess.WRITE)
	if not check(file != null, "open isolated save"): return
	var portable := host.to_portable_json(checkpoint)
	if not check(portable.ok, "encode portable checkpoint"): return
	file.store_string(portable.text)
	file.close()
	var loaded := host.from_portable_json(FileAccess.get_file_as_string("user://crafted-checkpoint.json"))
	if not check(loaded.ok, "decode portable checkpoint"): return
	var disk: Variant = loaded.value
	if not check(disk == checkpoint, "disk checkpoint retained"): return
	var resumed := Crafting.new()
	if not check(host.restore_profile(1, checkpoint).ok and resumed.start() == 0 and resumed.restore_profile(2, disk).ok, "fresh native host restore"): return
	var ids: Array = []
	for kind in ["roll", "forge", "roll"]:
		var spec := {"baseId":"ring_lapis", "ilvl":10, "rarity":"rare"}
		var a := host.roll(1, spec) if kind == "roll" else host.forge(1, spec)
		var b := resumed.roll(2, spec) if kind == "roll" else resumed.forge(2, spec)
		if not check(a.ok and a == b and a.result.uid != null, "disk RNG and UID continuation"): return
		ids.append(int(a.result.uid))
	var continued := host.snapshot(1)
	if not check(continued == resumed.snapshot(2) and ids[1] == ids[0]+1 and ids[2] == ids[1]+1, "continued state and IDs"): return
	var access := {"salvage":true, "oracle":true, "bench":true, "counter":true}
	if not check(host.restore_profile(2, recovered).ok, "restore full masked bag"): return
	if not check(host.open_profile(3, 42, recovered.state).get("reason") == "profile-limit", "two profiles share definitions"): return
	if not check(host.lock_item(2, 11, false, access).ok and host.salvage(2, 11, access, "sell").ok and host.recover(2, 13).result.moved, "recover into freed capacity"): return
	if not check(host.snapshot(2).save.state.overflow.is_empty(), "one owner after recovery"): return
	if not check(host.close_profile(2).ok and host.close_profile(1).ok, "retire old handles"): return
	var clean := {"board":{"w":8,"h":8}, "items":[], "overflow":[], "equipped":{}, "essences":{}, "account":{"features":[],"ledger":{},"craftLore":{},"progression":true}}
	clean.account.ledger[&"unicode-雪"] = 12
	if not check(host.open_profile(1, 7, clean).ok, "StringName ledger key admitted"): return
	var one := host.forge(1, {"baseId":"ring_lapis", "ilvl":1, "rarity":"common"})
	var two := host.forge(1, {"baseId":"ring_lapis", "ilvl":1, "rarity":"rare"})
	var counter := {"salvage":false, "oracle":false, "bench":false, "counter":true}
	if not check(one.ok and two.ok and host.salvage_bulk(1, "item", counter, null, "common").ok, "automatic counter lane with rarity filter"): return
	var left := host.snapshot(1).save as Dictionary
	if not check(left.state.items.size() == 1 and left.state.items[0].uid == two.result.uid and not left.state.essences.is_empty(), "only matching cargo sold"): return
	if not check(host.salvage(1, two.result.uid, counter).ok and host.snapshot(1).save.state.items.is_empty(), "automatic single sale"): return
	var before := host.snapshot(1)
	var large := "x".repeat(524289)
	var large_key := {}
	large_key[large] = true
	var allocations_before: int = host.metrics().allocations
	if not check(not host.from_portable_json(large).ok and not host.to_portable_json(large_key).ok and not host.request({"op":"save","profile":1,"bad":large}).ok, "oversized text refused"): return
	if not check(host.metrics().allocations == allocations_before, "oversized text never reaches embedded VM"): return
	var cycle: Array = []
	cycle.append(cycle)
	for bad in [Vector2(1,2), self, NAN, INF, 9007199254740992, {1:"numeric key"}, cycle]:
		if not check(host.request({"op":"save", "profile":1, "bad":bad}).get("reason") == "invalid-json", "lossy Variant refused before conversion"): return
	cycle.clear()
	if not check(before == host.snapshot(1), "refusals keep live profile intact"): return
	clean.account.features = ["control-" + String.chr(1) + "\n雪😀"]
	if not check(host.open_profile(2, 9, clean, 9007199254740991).ok, "exact UID boundary and text"): return
	var exact := host.snapshot(2).save as Dictionary
	var exact_uid := str(int(exact.nextUid))
	if not check(exact_uid == "9007199254740991" and exact.state.account.features == clean.account.features and exact.state.account.ledger["unicode-雪"] == 12, "Unicode, controls and safe integer retained"): return
	if not check(host.forge(2, {"baseId":"ring_lapis", "ilvl":1}).get("reason") == "uid-exhausted" and host.snapshot(2).save == exact, "late UID refusal rolls back"): return
	var progression := Progression.new()
	if not check(progression.start() == 0 and progression.open_profile(1, 19).ok, "progression starts independently from combined addon"): return
	if not check(progression.catalogue(1, 0, 1).total > 190 and host.snapshot(1) == before, "no cross-capability handle collision"): return
	if not extensions(host):return
	if not check(progression.close() == 0 and resumed.close() == 0 and host.close() == 0 and host.close() == 0, "release independent native hosts"): return
	if not check(host.snapshot(1).get("reason") == "native-host", "closed host refuses commands"): return
	for m in [host.metrics(), resumed.metrics(), progression.metrics()]:
		if not check(m.live_bytes == 0 and m.live_blocks == 0 and m.peak_bytes > 0 and m.peak_bytes <= 32*1024*1024, "tracked allocations released within per-host cap"): return
	print(JSON.stringify({"passed":true,"assertions":assertions,"commands":requests.size(),"operations":kinds.size(),"lore":checkpoint.state.account.craftLore.size(),"items":checkpoint.state.items.size(),"continued_ids":ids,"exact_uid":exact_uid,"disk":true,"combined":true,"extensions":["crafting-view/v1","crafting-station/v1","vestige-inlays/v1"],"metrics":host.metrics(),"resumed_metrics":resumed.metrics(),"progression_metrics":progression.metrics()}))
	get_tree().quit(0)
