extends RefCounted

# The game owns authorization and durable writes. One instance shares immutable
# definitions across at most eight open profiles; each profile has its own RNG.
const DATA := "res://addons/hollow_wake/progression/"
var _host := HollowWakeHost.new()

func start(heap_limit_bytes: int = 32 * 1024 * 1024) -> int:
	return _host.initialize(FileAccess.get_file_as_bytes(DATA + "bundle.txt"), FileAccess.get_file_as_bytes(DATA + "content.json"), heap_limit_bytes)

func open_profile(profile: int, seed_value: int, account: Variant = null) -> Dictionary:
	var command := {"op": "open", "profile": profile, "seed": seed_value}
	if account != null:
		command.account = account
	return request(command)

func restore_profile(profile: int, save: Dictionary) -> Dictionary:
	return request({"op": "restore", "profile": profile, "save": save})

func snapshot(profile: int) -> Dictionary:
	return request({"op": "save", "profile": profile})

func catalogue(profile: int, offset: int = 0, limit: int = 32) -> Dictionary:
	return request({"op": "catalogue", "profile": profile, "offset": offset, "limit": limit})

func buy(profile: int, unlock_id: String) -> Dictionary:
	return request({"op": "buy", "profile": profile, "id": unlock_id})

func invest(profile: int, unlock_id: String, amount: int) -> Dictionary:
	return request({"op": "invest", "profile": profile, "id": unlock_id, "amount": amount})

func settle(profile: int) -> Dictionary:
	return request({"op": "settle", "profile": profile})

func acknowledge(profile: int, unlock_id: String) -> Dictionary:
	return request({"op": "acknowledge", "profile": profile, "id": unlock_id})

func observe(profile: int, level: int, credits: int, ledger: Dictionary, roster: Array) -> Dictionary:
	return request({"op": "observe", "profile": profile, "level": level, "credits": credits, "ledger": ledger, "roster": roster})

func update_relics(profile: int, state: Dictionary) -> Dictionary:
	return request({"op": "relics", "profile": profile, "state": state})

func close_profile(profile: int) -> Dictionary:
	return request({"op": "close", "profile": profile})

func close() -> int:
	return _host.close()

func metrics() -> Dictionary:
	return _host.get_metrics()

func request(command: Dictionary) -> Dictionary:
	# Keep full binary64 precision, especially random continuation and safe integers.
	var encoded := JSON.stringify(command, "", true, true)
	# Godot 4.7.2 leaves some C0 controls literal in its JSON output. The compact
	# form has no structural whitespace; escape those literals before transport.
	# NUL is excluded by the portable profile format (Godot replaces it on import).
	for code in range(1, 32):
		encoded = encoded.replace(String.chr(code), "\\u%04x" % code)
	var reply := _host.submit_json(encoded)
	if reply.status != 0:
		return {"ok": false, "reason": "native-host", "status": reply.status}
	var decoded: Variant = JSON.parse_string(reply.response)
	if not decoded is Dictionary or not decoded.get("ok") is bool:
		_host.close()
		return {"ok": false, "reason": "invalid-native-response"}
	return decoded
