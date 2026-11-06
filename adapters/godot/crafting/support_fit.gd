extends "owned_session.gd"

const DATA := "res://addons/hollow_wake/crafting/"
const LIMIT := 48 * 1024
var _pages: Array = []
var _bytes := 0
var reads := 0
var bytes_read := 0
var queries := 0

func _matches(bytes: PackedByteArray, expected: Variant) -> bool:
	var hash := HashingContext.new()
	return hash.start(HashingContext.HASH_SHA256)==OK and hash.update(bytes)==OK and hash.finish().hex_encode()==expected

func _ready_gate() -> bool:
	if not _pages.is_empty(): return true
	var file := FileAccess.open(DATA+"support-index.json",FileAccess.READ)
	if file==null or file.get_length()>32768: return false
	var index_bytes := file.get_buffer(file.get_length())
	var index: Variant = JSON.parse_string(index_bytes.get_string_from_utf8())
	if not index is Dictionary or index.get("format")!="workshop-support-pages/v1" or not index.get("pages") is Array or index.pages.size()!=128: return false
	var offset := 0
	for row in index.pages:
		if not row is Dictionary or row.get("offset")!=offset or not row.get("length") is float or row.length!=floor(row.length) or row.length<1 or row.length>LIMIT: return false
		if not row.get("sha256") is String or row.sha256.length()!=64: return false
		offset+=int(row.length)
	if index.get("bytes")!=offset or offset>2*1024*1024: return false
	file=FileAccess.open(DATA+"manifest.json",FileAccess.READ)
	if file==null or file.get_length()>32768: return false
	var manifest: Variant = JSON.parse_string(file.get_as_text())
	if not manifest is Dictionary or not manifest.get("files") is Dictionary: return false
	if not manifest.get("content") is Array or manifest.content.size()!=3 or manifest.content[2]!=index.get("skillContentId"): return false
	if not _matches(index_bytes,manifest.files.get("support-index.json")): return false
	file=FileAccess.open(DATA+"support-fit.txt",FileAccess.READ)
	if file==null or file.get_length()>80*1024: return false
	var code:=file.get_buffer(file.get_length())
	if not _matches(code,manifest.files.get("support-fit.txt")) or _host.initialize(code,index_bytes,8*1024*1024)!=0: return false
	_pages=index.pages
	_bytes=offset
	return true

func fits(rack: Array, loose: Dictionary) -> Dictionary:
	if not _ready_gate(): return {"ok":false,"reason":"support-data"}
	queries+=1
	var bar := []
	for row in rack: bar.append(null if row==null else row.gem)
	var reply := request({"op":"fits","bar":bar,"support":loose})
	var data: FileAccess
	while reply.ok and reply.has("page"):
		var page := int(reply.page)
		if page<0 or page>=_pages.size(): return {"ok":false,"reason":"support-data"}
		if data==null: data=FileAccess.open(DATA+"support-pages.txt",FileAccess.READ)
		if data==null or data.get_length()!=_bytes: return {"ok":false,"reason":"support-data"}
		var row: Dictionary = _pages[page]
		data.seek(int(row.offset))
		var bytes := data.get_buffer(int(row.length))
		if bytes.size()!=int(row.length) or not _matches(bytes,row.sha256):
			return {"ok":false,"reason":"support-data"}
		reads+=1
		bytes_read+=bytes.size()
		reply=request({"op":"supply","page":page,"text":bytes.get_string_from_utf8()})
	return reply
