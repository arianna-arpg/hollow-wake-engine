extends RefCounted

# Private Godot wire encoding; the external save and command format is JSON.
var _host := HollowWakeHost.new()
const MAX_JSON_TEXT := 524288

func start_from(data_path: String, heap_limit_bytes: int) -> int:
	return _host.initialize(FileAccess.get_file_as_bytes(data_path + "bundle.txt"), FileAccess.get_file_as_bytes(data_path + "content.json"), heap_limit_bytes)

func close() -> int:
	return _host.close()

func metrics() -> Dictionary:
	return _host.get_metrics()

# A negative budget refuses the entire value, including cyclic/overdeep input.
func _wire(value: Variant, encode: bool, budget: Array[int], depth: int = 0) -> Variant:
	budget[0] -= 1
	if budget[0] < 0 or depth > 64:
		budget[0] = -1
		return null
	match typeof(value):
		TYPE_NIL, TYPE_BOOL:
			return value
		TYPE_STRING, TYPE_STRING_NAME:
			var s := String(value)
			if encode:
				budget[1] -= s.length()
				if budget[1] < 0:
					budget[0] = -1
					return null
			if not s.begins_with("~"): return s
			if encode: return "~" + s
			if s.begins_with("~~"): return s.substr(1)
			if s.begins_with("~f") and s.length() == 18 and s.substr(2).is_valid_hex_number(false):
				var n := s.substr(2).hex_decode().decode_double(0)
				if is_finite(n): return n
		TYPE_INT, TYPE_FLOAT:
			if typeof(value) == TYPE_INT and (value < -9007199254740991 or value > 9007199254740991):
				budget[0] = -1
				return null
			var n := float(value)
			if is_finite(n):
				if n >= -2147483647 and n <= 2147483647 and floor(n) == n:
					if encode: return int(n)
					return n # Keep the existing Godot JSON number representation.
				if encode:
					var bytes := PackedByteArray()
					bytes.resize(8)
					bytes.encode_double(0, n)
					return "~f" + bytes.hex_encode()
		TYPE_ARRAY:
			var array := []
			for entry in value:
				array.append(_wire(entry, encode, budget, depth + 1))
				if budget[0] < 0: return null
			return array
		TYPE_DICTIONARY:
			var dict := {}
			for key in value:
				if not key is String and not key is StringName:
					budget[0] = -1
					return null
				var name_text := String(key)
				if encode:
					budget[1] -= name_text.length()
					if budget[1] < 0:
						budget[0] = -1
						return null
				dict[name_text] = _wire(value[key], encode, budget, depth + 1)
				if budget[0] < 0: return null
			return dict
	budget[0] = -1
	return null

func _exchange(mode: String, payload: Variant) -> Dictionary:
	# Stop oversized user input before constructing and escaping a second copy.
	if mode == "parse" and payload.length() > MAX_JSON_TEXT:
		return {"ok":false, "reason":"invalid-json"}
	var budget: Array[int] = [65536, MAX_JSON_TEXT]
	var body: Variant = payload if mode == "parse" else _wire(payload, true, budget)
	if budget[0] < 0: return {"ok":false, "reason":"invalid-json"}
	var encoded := JSON.stringify([mode, body], "", false)
	# Godot can emit literal C0 controls; strict JSON disallows them.
	for code in range(1, 32):
		encoded = encoded.replace(String.chr(code), "\\u%04x" % code)
	var reply := _host.submit_json(encoded)
	if reply.status != 0: return {"ok":false, "reason":"native-host", "status":reply.status}
	var result: Variant = JSON.parse_string(reply.response)
	if result is Dictionary and result.get("ok") is bool:
		if mode == "format": return result
		budget[0] = 65540
		var decoded: Variant = _wire(result, false, budget)
		if budget[0] >= 0: return decoded
	_host.close()
	return {"ok":false, "reason":"invalid-native-response"}

func request(command: Dictionary) -> Dictionary:
	return _exchange("command", command)

# Persist .text, and restore from .value. Neither operation changes a profile.
func to_portable_json(value: Variant) -> Dictionary:
	return _exchange("format", value)

func from_portable_json(text: String) -> Dictionary:
	return _exchange("parse", text)
