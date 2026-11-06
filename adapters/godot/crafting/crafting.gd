extends "owned_session.gd"

const DATA := "res://addons/hollow_wake/crafting/"
var _inspection_ready := false
var _equipment_ready := false
const CargoCards = preload("cargo_cards.gd")
var _cargo_cards := CargoCards.new()
var _cargo_page_limit := 4
const SupportFit = preload("support_fit.gd")
var _fit: SupportFit
const PouchRecall = preload("pouch_recall.gd")
var _pouch: PouchRecall

func pouch_request(command: Dictionary) -> Dictionary:
	if _pouch==null: _pouch=PouchRecall.new()
	var reply:=_pouch.query(command)
	if not reply.ok and reply.get("reason") in ["recall-data","native-host","invalid-native-response"]:
		_pouch.close()
		_pouch=null
	return reply

func start(heap_limit_bytes: int = 32 * 1024 * 1024) -> int:
	var status := start_from(DATA, heap_limit_bytes)
	if status == 0: _reset_cards()
	return status

func close() -> int:
	var status := super.close()
	if status == 0: _reset_cards()
	return status

func _reset_cards() -> void:
	if _pouch!=null:
		_pouch.close()
		_pouch=null
	if _fit!=null:
		_fit.close()
		_fit=null
	_inspection_ready = false
	_equipment_ready = false
	_cargo_cards = CargoCards.new()
	_cargo_cards.set_page_limit(_cargo_page_limit)

func _load_inspection() -> Dictionary:
	if _inspection_ready: return {"ok":true}
	var vocabulary := FileAccess.open(DATA + "inspection.json", FileAccess.READ)
	if vocabulary == null or vocabulary.get_length() > 65536: return {"ok":false,"reason":"invalid-vocabulary"}
	var reply := request({"op":"configure-inspection","text":vocabulary.get_as_text()})
	_inspection_ready = reply.ok or reply.get("reason","") == "already-configured"
	return {"ok":true} if _inspection_ready else reply

# Accepts a detached body from any location, including a host-owned stash.
func inspect_item(item: Dictionary) -> Dictionary:
	var ready := _load_inspection()
	return request({"op":"inspect-item","item":item}) if ready.ok else ready

func compare_items(candidate: Dictionary, worn: Dictionary) -> Dictionary:
	var ready := _load_inspection()
	return request({"op":"compare-items","candidate":candidate,"worn":worn}) if ready.ok else ready

func _load_equipment() -> Dictionary:
	if _equipment_ready: return {"ok":true}
	var file := FileAccess.open(DATA + "equipment.json", FileAccess.READ)
	if file == null or file.get_length() > 8192: return {"ok":false,"reason":"invalid-equipment-slots"}
	var reply := request({"op":"configure-equipment","text":file.get_as_text()})
	_equipment_ready = reply.ok or reply.get("reason","") == "already-configured"
	return {"ok":true} if _equipment_ready else reply

func inspect_loadout(item: Dictionary, equipped: Dictionary, hero_level: int, detail := "compact") -> Dictionary:
	var ready := _load_inspection()
	if ready.ok: ready = _load_equipment()
	return request({"op":"inspect-loadout","item":item,"equipped":equipped,"heroLevel":hero_level,"detail":detail}) if ready.ok else ready

func equip(profile: int, uid: int, actor_level: int, slot := "") -> Dictionary:
	var ready := _load_equipment()
	var command := {"op":"equip","profile":profile,"uid":uid,"actorLevel":actor_level}
	if not slot.is_empty(): command.slot = slot
	return request(command) if ready.ok else ready

func unequip(profile: int, uid: int, slot: String) -> Dictionary:
	var ready := _load_equipment()
	return request({"op":"unequip","profile":profile,"uid":uid,"slot":slot}) if ready.ok else ready

# fit is the equipped actor's current socket-gate verdict for this exact gem.
# Passing [] describes a known empty bar. Omitting it leaves the bar unspecified.
func inspect_cargo(item: Dictionary, view: Dictionary = {}, fit: Variant = null, socket_names := false) -> Dictionary:
	return _cargo_cards.inspect(self,item,view,fit,socket_names)

func set_cargo_page_limit(pages: int) -> bool:
	if not _cargo_cards.set_page_limit(pages): return false
	_cargo_page_limit = pages
	return true

func cargo_cache_info() -> Dictionary:
	return _cargo_cards.cache_info()

func skill_requirements(item: Dictionary, attributes: Dictionary) -> Dictionary:
	return _cargo_cards.meets(self,item,attributes)

func support_fit(rack: Array, gem: Dictionary) -> Dictionary:
	if not rack.any(func(row): return row!=null): return {"ok":true,"rows":[]}
	if _fit==null: _fit=SupportFit.new()
	var reply:=_fit.fits(rack,gem)
	if not reply.ok:
		_fit.close()
		_fit=null
	return reply

func support_metrics() -> Dictionary:
	return {"queries":_fit.queries,"pageReads":_fit.reads,"bytesRead":_fit.bytes_read,"heap":_fit.metrics()} if _fit!=null else {"queries":0,"pageReads":0,"bytesRead":0}

func socket_support(profile: int, uid: int, skill_id: String, fits: bool, hold: Variant = null) -> Dictionary:
	return request({"op":"socket-support","profile":profile,"uid":uid,"skillId":skill_id,"fits":fits,"hold":hold})

func unsocket_support(profile: int, skill_id: String, index: int, support_id: String, bag_uid := 0, hold: Variant = null) -> Dictionary:
	var command := {"op":"unsocket-support","profile":profile,"skillId":skill_id,"index":index,"supportId":support_id,"hold":hold}
	if bag_uid!=0: command.uid=bag_uid
	return request(command)

func learn_skill(profile: int, uid: int, meets: bool, blocked: Dictionary, slot := -1) -> Dictionary:
	var command := {"op":"learn-skill","profile":profile,"uid":uid,"meets":meets,"blocked":blocked}
	if slot != -1: command.slot = slot
	return request(command)

func unlearn_skill(profile: int, skill_id: String, blocked: Dictionary) -> Dictionary:
	return request({"op":"unlearn-skill","profile":profile,"skillId":skill_id,"blocked":blocked})

func open_profile(profile: int, seed_value: int, state: Dictionary, next_uid: Variant = null) -> Dictionary:
	var command := {"op": "open", "profile": profile, "seed": seed_value, "state": state}
	if next_uid != null:
		command.nextUid = next_uid
	return request(command)

func restore_profile(profile: int, save: Dictionary) -> Dictionary:
	return request({"op": "restore", "profile": profile, "save": save})

func snapshot(profile: int) -> Dictionary:
	return request({"op": "save", "profile": profile})

func snapshot_text(profile: int) -> Dictionary:
	return request({"op":"snapshot-text","profile":profile})

func close_profile(profile: int) -> Dictionary:
	return request({"op": "close", "profile": profile})

func options(profile: int, uid: int, offset: int = 0, limit: int = 32) -> Dictionary:
	return request({"op": "options", "profile": profile, "uid": uid, "offset": offset, "limit": limit})

func forge(profile: int, specification: Dictionary) -> Dictionary:
	return request({"op": "mint", "profile": profile, "kind": "forge", "options": specification})

func roll(profile: int, specification: Dictionary) -> Dictionary:
	return request({"op": "mint", "profile": profile, "kind": "roll", "options": specification})

func craft(profile: int, uid: int, affix_id: String, score: float, access: Dictionary) -> Dictionary:
	return request({"op": "craft", "profile": profile, "uid": uid, "affixId": affix_id, "score": score, "access": access})

func socket(profile: int, uid: int, access: Dictionary) -> Dictionary:
	return request({"op": "socket", "profile": profile, "uid": uid, "access": access})

func reroll(profile: int, uid: int, index: int, score: float, access: Dictionary) -> Dictionary:
	return request({"op": "reroll", "profile": profile, "uid": uid, "index": index, "score": score, "access": access})

func salvage(profile: int, uid: int, access: Dictionary, lane: Variant = null) -> Dictionary:
	var command := {"op": "salvage", "profile": profile, "uid": uid, "access": access}
	if lane != null:
		command.lane = lane
	return request(command)

func salvage_bulk(profile: int, category: String, access: Dictionary, lane: Variant = null, rarity: Variant = null) -> Dictionary:
	var command := {"op": "salvage-bulk", "profile": profile, "category": category, "access": access}
	if lane != null:
		command.lane = lane
	if rarity != null:
		command.rarity = rarity
	return request(command)

func lock_item(profile: int, uid: int, on: bool, access: Dictionary) -> Dictionary:
	return request({"op": "lock", "profile": profile, "uid": uid, "on": on, "access": access})

func recover(profile: int, uid: int) -> Dictionary:
	return request({"op": "recover", "profile": profile, "uid": uid})

# Successful transfer removes the body from this session. The host must complete
# destination custody and persist its transaction before discarding the result.
func take_overflow(profile: int, uid: int) -> Dictionary:
	return request({"op": "take-overflow", "profile": profile, "uid": uid})
