extends RefCounted
# Same localhost TCP / newline JSON seam as Vesperwild Combat. Parsing waits
# for complete UTF-8 lines; input/output buffers are bounded, writes partial.
var peer := StreamPeerTCP.new()
var incoming := PackedByteArray()
var outgoing := PackedByteArray()
var connected := false
var failure := ""

func connect_to(port: int) -> void:
	var result := peer.connect_to_host("127.0.0.1", port)
	if result != OK:
		failure = "Cannot connect to combat host"

func send(message: Dictionary) -> void:
	var bytes := (JSON.stringify(message) + "\n").to_utf8_buffer()
	if outgoing.size() + bytes.size() > 65536:
		fail("Input queue full")
		return
	outgoing.append_array(bytes)

func fail(message: String) -> void:
	failure = message
	peer.disconnect_from_host()
	connected = false
	incoming.clear()
	outgoing.clear()

func poll() -> Array:
	var messages: Array = []
	peer.poll()
	var status := peer.get_status()
	if status != StreamPeerTCP.STATUS_CONNECTED:
		if connected:
			fail("Combat host disconnected")
		return messages
	if not connected:
		connected = true
		peer.set_no_delay(true)
	if not outgoing.is_empty():
		var sent: Array = peer.put_partial_data(outgoing)
		if int(sent[0]) != OK:
			fail("Cannot send input")
			return messages
		outgoing = outgoing.slice(int(sent[1]))
	var count := peer.get_available_bytes()
	if incoming.size() + count > 2097152:
		fail("Host message exceeds limit")
		return messages
	if count > 0:
		var received: Array = peer.get_partial_data(count)
		if int(received[0]) != OK:
			fail("Cannot read host")
			return messages
		incoming.append_array(received[1])
	var start := 0
	while true:
		var stop := incoming.find(10, start)
		if stop < 0:
			break
		var parsed: Variant = JSON.parse_string(incoming.slice(start, stop).get_string_from_utf8())
		if not parsed is Dictionary:
			fail("Invalid host message")
			return []
		messages.append(parsed)
		start = stop + 1
	if start > 0:
		incoming = incoming.slice(start)
	return messages
