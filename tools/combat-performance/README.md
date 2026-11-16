# Portable combat and Inventory measurements

This folder runs the installed SDK without the original game, quests, account
services or saved games. It exercises a reference Node host, authored combat
rules and character builds. It does not run a renderer or simulate a whole game.
Host frame construction is timed; JSON wire encoding, socket transport and the
Godot client are excluded.

Use Node 22 or later on Windows or Linux, including a Steam Deck with a separately
installed Node runtime. No npm install or Internet access is needed to run the kit.
Choose a new report filename for every run; existing reports are never replaced.

```sh
node run.mjs --mode check --out check.json --label "Steam Deck LCD"
node run.mjs --mode timing --out timing.json --label "Steam Deck LCD" --conditions "15 W, plugged in, Desktop Mode"
node run.mjs --mode profile --out profile.json --label "Steam Deck LCD"
node --expose-gc run.mjs --mode memory --out memory.json --label "Steam Deck LCD"
node --expose-gc lifetime.mjs --out lifetime-1000.json
```

Run one command at a time with other demanding applications stopped. Timing
defaults to seven rounds. `--rounds 3` shortens timing; `--course mixed-32`
selects one course. Check mode records every measured operation's exact output
digest plus the final state and random continuation. Timing does not calculate
frame digests inside the measured operation. Profile and memory modes deliberately
run separately. The forced collections in memory mode belong only to the probe;
they are not a recommendation for a game loop.
The separate lifetime course checks 1,000 create/advance/close/release cycles
with collections between ten blocks, matching output digests and a 4 MiB
retained-heap-growth ceiling. It is a memory probe, not a timing benchmark.

The report includes the runtime, CPU, operating system, content/package hashes,
course definition, samples, median/p95/p99 operation duration, process CPU time,
content import time, initial course setup time, declared measurement limits and
the compile-cache environment. The paired `compare.mjs` disables Node's
optional on-disk compile cache in every child process so cached compilation cannot
conceal cold content-loading costs. Passing `--budgets` requires all seven pairs;
shorter comparisons are exploratory. CPU totals include
untimed setup inside each course; operation timings exclude that setup. The
allocation estimate includes setup, warmup, observation and the measured course,
so compare it only against the same course and sampling settings. Sampled V8
allocation is not exact native allocation. Peak process RSS is cumulative for
the process. Run individual courses in fresh processes for isolated peaks.

The proc/summon course starts with 32 actors and can create more bodies. The
mixed courses start with 32 or 128. Cast attempts, successful casts, proc events,
peak body/projectile/status counts and final state identify the actual work.
Synthetic placement, high resources and scripted inputs keep the encounter
repeatable. Scripted inputs use seed 711; imported reference-scene courses retain
the scene's seed 71, and extra Inventory item rolls use seed 711.
The build course equips a ring, sockets a support and allocates a
passive, with preview and live publication for each. Inventory inspection includes
24 additional authored rings and their item cards. These courses complement the
SDK's frozen original-game comparisons; they do not replace them.

For a browser on an older phone or tablet, run `node serve.mjs` and open the
printed address on this computer. To use another device on your local network,
explicitly choose this computer's local network address:

```sh
node serve.mjs --host 192.168.1.20 --port 8787
```

Open that address on the device, enter its model and conditions, then run and
save the report. The server serves only the four measurement files and stores
nothing. Stop it with Ctrl+C. No firewall or system settings are changed by this
kit. A browser with ES2022, module workers and `structuredClone` is required;
older hardware alone does not establish browser compatibility.

Browser results use the same workload and a worker so the page remains
responsive. They report timing and repeatability, not memory or allocation.
Browser content-import time includes downloading and parsing the script as well
as initialization; it is distinct from the operation timings and the Node import.
Per-operation zeros expose coarse browser timer resolution. Keep the tab visible;
a hidden-tab run is rejected. Browser fingerprints are non-security repeatability
checks; exact before/after trace acceptance uses the Node runner. Physical-device
and sustained thermal qualification must be reported separately from desktop
engineering measurements.

API definitions for the measurement units are in the official
[Node process documentation](https://nodejs.org/docs/latest-v24.x/api/process.html#processresourceusage)
and [Node inspector documentation](https://nodejs.org/docs/latest-v24.x/api/inspector.html).
