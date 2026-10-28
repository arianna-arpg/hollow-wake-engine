extends Node

var checks := 0

func require(condition: bool, message: String) -> bool:
	checks += 1
	if not condition:
		push_error(message)
		get_tree().quit(1)
	return condition

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() == 1:
		args = PackedStringArray(["res://addons/hollow_wake/data/bundle.txt", "res://addons/hollow_wake/data/content.json", "res://fixtures/requests.jsonl", args[0]])
	if not require(args.size() == 4, "Bundle, content, requests and output required"):
		return
	var host := HollowWakeHost.new()
	if not require(host.initialize(FileAccess.get_file_as_bytes(args[0]), FileAccess.get_file_as_bytes(args[1])) == 0, "Gameplay initialization"):
		return
	var output := FileAccess.open(args[3], FileAccess.WRITE)
	if not require(output != null, "Open observations output"):
		return
	var requests := 0
	for request in FileAccess.get_file_as_string(args[2]).split("\n", false):
		var response := host.submit_json(request.strip_edges())
		if not require(response.status == 0, "Gameplay request %d" % requests):
			return
		output.store_line(response.response)
		requests += 1
	output.close()
	if not require(host.close() == 0 and host.close() == 0, "Idempotent close"):
		return
	var final_metrics := host.get_metrics()
	if not require(final_metrics.live_bytes == 0 and final_metrics.live_blocks == 0 and final_metrics.closed, "Gameplay owner has no tracked allocations after close"):
		return
	if not require(host.submit_json("{}").status == 1 and host.cancel() == 1, "Closed owner refuses execution and cancellation"):
		return
	var bundle := "var HollowWakeSession={create(){return {n:0};},dispatch(s,r){s.n+=(r.inc||0);if(r.spin)while(true){};if(r.fail)throw Error('after mutation');return r.text||s.n;}};".to_utf8_buffer()
	var empty := "{}".to_utf8_buffer()
	if not require(host.initialize("{".to_utf8_buffer(), empty) == 4, "Invalid construction refused"):
		return
	if not require(host.initialize(bundle, empty, -1) == 1, "Negative heap rejected"):
		return
	if not require(host.initialize(bundle, empty) == 0, "Reopen after failed construction"):
		return
	if not require(host.initialize(bundle, empty) == 1, "Initialization cannot replace a live owner"):
		return
	if not require(host.submit_json('{"inc":1}').response == "1", "Persistent state"):
		return
	if not require(host.submit_json('{"text":"火🔥"}').response == '"火🔥"', "Unicode boundary"):
		return
	var other := HollowWakeHost.new()
	if not require(other.initialize(bundle, empty) == 0 and other.submit_json("{}").response == "0", "Independent owners"):
		return
	if not require(host.submit_json('{"inc":1,"fail":true}').status == 4, "Failure after mutation"):
		return
	if not require(host.submit_json("{}").status == 5 and host.get_metrics().poisoned, "Failed owner cannot continue"):
		return
	if not require(other.cancel() == 0 and other.submit_json("{}").status == 10, "Cancellation reaches native runtime"):
		return
	if not require(other.get_metrics().poisoned, "Cancelled owner cannot continue"):
		return
	if not require(host.close() == 0 and other.close() == 0, "Close failed owners"):
		return
	if not require(host.get_metrics().live_bytes == 0 and other.get_metrics().live_bytes == 0, "Failed owners release tracked memory"):
		return
	var weak: WeakRef = weakref(other)
	other = null
	if not require(weak.get_ref() == null, "Godot releases reference-counted wrapper"):
		return
	if not thread_checks(host, bundle, empty):
		return
	print(JSON.stringify({"passed":true,"requests":requests,"checks":checks,"live_bytes_after_dispose":final_metrics.live_bytes,"live_blocks_after_dispose":final_metrics.live_blocks,"packaged_inputs":args[0].begins_with("res://"),"editor_build":OS.has_feature("editor"),"thread_checks":true}))
	get_tree().quit(0)

func increments(host: HollowWakeHost) -> Array:
	var values: Array = []
	for index in 32:
		var response := host.submit_json('{"inc":1}')
		if response.status != 0:
			return []
		values.append(int(response.response))
	return values

func wait_busy(host: HollowWakeHost) -> bool:
	var deadline := Time.get_ticks_msec() + 5000
	while Time.get_ticks_msec() < deadline:
		if host.get_metrics().status == 6:
			return true
		OS.delay_msec(1)
	return false

func spin(host: HollowWakeHost) -> Dictionary:
	return host.submit_json('{"spin":true}')

func close_from_worker(host: HollowWakeHost, started: Semaphore) -> int:
	started.post()
	return host.close()

func thread_checks(host: HollowWakeHost, bundle: PackedByteArray, empty: PackedByteArray) -> bool:
	if not require(host.initialize(bundle, empty) == 0, "Initialize threaded owner"):
		return false
	var first := Thread.new()
	var second := Thread.new()
	if not require(first.start(increments.bind(host)) == OK and second.start(increments.bind(host)) == OK, "Start Godot workers"):
		return false
	var values: Array = first.wait_to_finish()
	values.append_array(second.wait_to_finish())
	values.sort()
	if not require(values == range(1, 65) and host.submit_json("{}").response == "64", "Concurrent calls serialize exactly once"):
		return false
	if not require(first.start(spin.bind(host)) == OK, "Start long-running native request"):
		return false
	var busy := wait_busy(host)
	var cancelled := host.cancel()
	var response: Dictionary = first.wait_to_finish()
	if not require(busy and cancelled == 0 and response.status == 10 and host.get_metrics().poisoned, "Metrics remain responsive and cancellation interrupts execution"):
		return false
	if not require(host.close() == 0 and host.get_metrics().live_bytes == 0, "Close interrupted worker owner"):
		return false
	for attempt in 4:
		if not require(host.initialize(bundle, empty) == 0 and first.start(spin.bind(host)) == OK, "Initialize close/cancel overlap"):
			return false
		busy = wait_busy(host)
		var started := Semaphore.new()
		if not require(second.start(close_from_worker.bind(host, started)) == OK, "Queue close from another Godot worker"):
			return false
		started.wait()
		cancelled = host.cancel()
		response = first.wait_to_finish()
		var closed: int = second.wait_to_finish()
		if not require(busy and cancelled == 0 and response.status == 10 and closed == 0 and host.get_metrics().live_bytes == 0, "Cancellation remains available while close waits"):
			return false
	return true
