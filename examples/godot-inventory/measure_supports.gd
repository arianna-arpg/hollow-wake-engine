extends RefCounted

const Gate=preload("res://addons/hollow_wake/crafting/support_fit.gd")

func _query(gate: RefCounted, row: Dictionary, times: Array) -> bool:
	var rack: Array=[]
	for gem in row.bar: rack.append(null if gem==null else {"gem":gem})
	var start:=Time.get_ticks_usec()
	var answer: Dictionary=gate.fits(rack,row.support)
	times.append(Time.get_ticks_usec()-start)
	return answer.ok and answer.rows==row.expected

func measure() -> Dictionary:
	var cases: Variant=JSON.parse_string(FileAccess.get_file_as_string("res://support-measure.json"))
	if not cases is Array or cases.size()!=2: return {"ok":false,"reason":"measurement-data"}
	var gate:=Gate.new()
	var cold: Array=[]
	if not _query(gate,cases[0],cold):
		gate.close()
		return {"ok":false,"reason":"cold-verdict"}
	var hot: Array=[]
	var before:=gate.reads
	for i in 32:
		if not _query(gate,cases[0],hot):
			gate.close()
			return {"ok":false,"reason":"hot-verdict"}
	var warm_reads:=gate.reads-before
	var changing: Array=[]
	for i in 32:
		if not _query(gate,cases[(i+1)%2],changing):
			gate.close()
			return {"ok":false,"reason":"changed-verdict"}
	var metrics:=gate.metrics()
	gate.close()
	var released:=gate.metrics()
	if released.live_bytes!=0 or released.live_blocks!=0: return {"ok":false,"reason":"release"}
	hot.sort()
	changing.sort()
	return {"ok":true,"queries":65,"coldUs":cold[0],"warmP50Us":hot[15],"warmP95Us":hot[30],"warmPageReads":warm_reads,
		"changingP50Us":changing[15],"changingP95Us":changing[30],"pageReads":gate.reads,"bytesRead":gate.bytes_read,
		"peakEmbeddedBytes":metrics.peak_bytes,"releasedBytes":released.live_bytes,"cpu":OS.get_processor_name(),"platform":OS.get_name()}
