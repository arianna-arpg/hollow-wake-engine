# Run the Hollow Wake device workload

On Linux x86_64, extract the kit with tar so the two games keep their
executable permissions and shared engine files. Open a terminal in
`hollow-wake-device`. Use Python 3.9 or later in the Linux environment where
you intend to launch the games. For comparison with the supplied proof, use
the matching Steam Runtime 4 Platform. Record your launch environment.

~~~sh
python3 measure.py --bundle . --platform-proof platform.json --out ../deck-run-01 --label "Steam Deck LCD" --conditions "15 W, plugged in, Desktop Mode"
~~~

Use your actual device name and settings. Select a new output directory for
each run. The default runs one warmup pair and five measured pairs. Each
game starts in a fresh process with its own save and configuration folders.
The order alternates across measured pairs.

`measurement.json` records elapsed process time in nanoseconds, user and
kernel CPU time in microseconds, peak process RSS in KiB and the peak tracked
allocation for each native host in bytes. It also records the label, visible
memory and CPU count available to the process. Each sample includes Godot
startup, content loading, the scripted menu course, save and observation I/O,
and shutdown. Rendering, frame pacing, input latency and battery use require
separate measurements.

Keep the per-sample folders for diagnosis. The runner checks the export
digests, all 56 crafting replies, progression results and native shutdown
before accepting a run. All files stay on the machine you use. Share the
result only if you choose to. The included notices cover Godot, its components,
the native extension dependencies and the Hollow Wake SDK.
