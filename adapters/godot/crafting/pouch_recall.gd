extends "owned_session.gd"

const DATA := "res://addons/hollow_wake/crafting/"
var _started := false

func _verified(name_text: String, limit: int, hashes: Dictionary) -> PackedByteArray:
	var file := FileAccess.open(DATA + name_text, FileAccess.READ)
	if file == null or file.get_length() > limit: return PackedByteArray()
	var bytes := file.get_buffer(file.get_length())
	var hash := HashingContext.new()
	if hash.start(HashingContext.HASH_SHA256) != OK or hash.update(bytes) != OK: return PackedByteArray()
	return bytes if hash.finish().hex_encode() == hashes.get(name_text) else PackedByteArray()

func query(command: Dictionary) -> Dictionary:
	if not _started:
		var manifest_file := FileAccess.open(DATA+"manifest.json",FileAccess.READ)
		if manifest_file==null or manifest_file.get_length()>32768: return {"ok":false,"reason":"recall-data"}
		var manifest: Variant = JSON.parse_string(manifest_file.get_as_text())
		if not manifest is Dictionary or not manifest.get("files") is Dictionary: return {"ok":false,"reason":"recall-data"}
		if not manifest.get("content") is Array or manifest.content.size()!=3: return {"ok":false,"reason":"recall-data"}
		var code := _verified("pouch-rules.txt",28*1024,manifest.files)
		var content := _verified("pouch-data.json",384*1024,manifest.files)
		if code.is_empty() or content.is_empty() or _host.initialize(code,content,12*1024*1024)!=0:
			return {"ok":false,"reason":"recall-data"}
		var bound:=request({"op":"bind","itemId":manifest.content[0],"skillId":manifest.content[2]})
		if not bound.ok:
			close()
			return bound
		_started=true
	return request(command)

func close() -> int:
	_started=false
	return super.close()
