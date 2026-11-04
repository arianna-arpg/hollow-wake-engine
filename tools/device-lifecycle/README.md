# Run the device benchmark

Download the [standalone v0.41.0 benchmark](../../evidence/device-lifecycle/hollow-wake-device-benchmark-0.41.0.html) as a file and open it in a browser on the device you want to measure. It runs offline. On a platform that previews HTML as text, open the file with the browser or serve the same file as a static page.

1. Start with 100 actors. Optionally enter the device model, power setting and test conditions.
2. Keep the page in the foreground and select **Run benchmark**. You can repeat with 500 or 1,000 actors.
3. Select **Save JSON report**. Compare runs using the same SDK archive hash, actor count and power conditions. The report remains local unless you share it.

The simulation uses the existing seeded casting and timed-damage benchmark. Every actor has individual resources, cast state, effect state, an independent target and one of five cast-speed settings. A host-selected resolved effect follows each completed cast. The engine runs 300 warmup updates and 1,200 measured updates at a fixed simulation step of 1/60 second. The browser measures 60 batches of 20 updates and reports the median and 95th percentile of the batch means. It checks cast completions, effect updates, build count and damage checksum against the recorded SDK workload before accepting the result. A coarse timer is identified in the report.

These measurements cover simulation work inside the browser. Rendering, audio, game input, disk I/O and native-engine calls have their own costs. A desktop replay verifies behavior and report export. Device-specific timings require a run on the named device.

## Rebuild

From a checkout with Node 24, run:

```sh
npm ci
npm run build
node scripts/build-device-lifecycle.mjs --output .artifacts/device-benchmark.html
```

You can pass `--archive FILE.tgz` to measure a specific SDK package. The builder installs the tarball into a fresh consumer, bundles only local SDK modules, and refuses to overwrite its output. The HTML embeds the selected content, reference outcomes, SDK version and archive hash, license and required notice. To exercise a real browser, run:

```sh
node scripts/test-device-lifecycle.mjs --html .artifacts/device-benchmark.html --electron ELECTRON_EXECUTABLE
```

The desktop course downloads all three reports, rejects deliberately wrong outcomes, interrupts an unfinished run, and checks a simulated coarse timer. The Node harness uses the same frame implementation. [Recorded Node workload](../../evidence/milestone-two/lifecycle-performance.json)
