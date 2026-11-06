extends "owned_session.gd"

const DATA := "res://addons/hollow_wake/crafting/"

func start(heap_limit_bytes: int = 32 * 1024 * 1024) -> int:
	return start_from(DATA, heap_limit_bytes)

func open_profile(profile: int, seed_value: int, state: Dictionary, next_uid: Variant = null) -> Dictionary:
	var command := {"op": "open", "profile": profile, "seed": seed_value, "state": state}
	if next_uid != null:
		command.nextUid = next_uid
	return request(command)

func restore_profile(profile: int, save: Dictionary) -> Dictionary:
	return request({"op": "restore", "profile": profile, "save": save})

func snapshot(profile: int) -> Dictionary:
	return request({"op": "save", "profile": profile})

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
