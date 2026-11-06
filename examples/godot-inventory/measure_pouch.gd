extends RefCounted

const Gate=preload("res://addons/hollow_wake/crafting/pouch_recall.gd")

func measure() -> Dictionary:
	var cases: Variant=JSON.parse_string(FileAccess.get_file_as_string("res://recall-measure.json"))
	if not cases is Array or cases.size()!=5: return {"ok":false,"reason":"measurement-data"}
	var gate:=Gate.new()
	var times: Array[int]=[]
	var cold:=0
	for i in 66:
		var row: Dictionary=cases[i%cases.size()]
		var unit: Dictionary=row.unit
		var group: String=unit.d
		if unit.has("g"): group+="|"+unit.g.k+":"+unit.g.id
		var base:="preformed_memory" if row.has("facet") else "rough_memory"
		var pouch:={"baseId":base,"uid":1,"x":0,"y":0,"mem":[unit]}
		var command:={"op":"recall","memory":null,"level":1,"uid":1,"group":group,"nextUid":2,"sealed":false,
			"state":{"items":[pouch],"board":{"w":1,"h":1},"account":{"ledger":{},"features":[],"progression":true}}}
		if row.has("facet"): command.facet=row.facet
		var start:=Time.get_ticks_usec()
		var result:=gate.query(command)
		var elapsed:=Time.get_ticks_usec()-start
		if not result.ok or result.items.size()!=1 or result.items[0].gem!=row.gem:
			gate.close()
			return {"ok":false,"reason":"recall-mismatch","case":i}
		if i==0: cold=elapsed
		else: times.append(elapsed)
	times.sort()
	var peak: int=gate.metrics().peak_bytes
	gate.close()
	var live: int=gate.metrics().live_bytes
	return {"ok":live==0,"platform":OS.get_name(),"cpu":OS.get_processor_name(),"queries":66,"coldUs":cold,
		"warmP50Us":times[32],"warmP95Us":times[61],"peakEmbeddedBytes":peak,"releasedBytes":live}
