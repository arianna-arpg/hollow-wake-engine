# Versioned inventory views

The workshop now reuses unchanged, frozen account lore when obtaining an
inventory view. Portable saves remain complete. The final implementation also
preserves field order when a view is used for a restore: the private projection
keeps a null account slot until the reader supplies its matching account.

Median main-thread work for repeated learn/unlearn actions on the loaded
128-item, 3,929-lore profile:

| Exported headless player | Prior background saving | Unchanged control | Versioned view |
| --- | ---: | ---: | ---: |
| Windows x64 | 119.24 ms | 118.76 ms | 58.41 ms |
| Steam Runtime 4 Linux container | 99.69 ms | 101.17 ms | 48.53 ms |

Both run on the same i9-10900K PC. This is about 51% less main-thread work in
this workload. Four-item actions remain around 2.3–2.6 ms; no general small-profile
speedup is claimed. Each platform has two fresh process runs per variant, with
64 measured actions per profile size and variant after warmups. Synchronous,
baseline, candidate and unchanged-control order is balanced. The original
native libraries and authored content are retained; only the candidate gameplay
bundle, wrapper and profile read path change.

Every variant commits identical SQLite document bytes, revisions, item ownership,
UID continuation and RNG state. The final save hashes also agree across platforms.
The runner independently reads SQLite, checks integrity and reopens the profile.
[Windows](measure-windows.json) and [Linux](measure-linux.json) summaries link to
compressed raw samples, including warmups, individual API phases, polling spans,
frame intervals and VM metrics. Nested phase timings must not be added.

Cold account reads still cost approximately 115–121 ms in the two Windows
candidate runs and 97–112 ms in the Linux runs. Changed accounts require a full
refresh too. Remaining warm costs include roughly 31 ms per owned command on
Windows and 25 ms on Linux, plus full-save serialization. The optimization does
not establish a frame budget. GPU rendering, physical Steam Deck/mobile hardware,
ARM packages and whole-process allocation measurements remain open. The largest
candidate VM peak is 32,132,168 bytes, within its 32 MiB cap; initialization is
included and this is not total process memory. Closed hosts retain zero VM blocks.

The final code passes `npm run verify`: 1,576 tests, installed/browser consumers
and fault checks. The owned-session suite has 16 contracts and catches 12 deliberate
faults, including borrowed view state, token reuse and changed serialization order.
Both rebuilt, relocated players pass background save/reopen and inlay courses.
Each platform also passes the original 56-command course, 95 gear cards, 42 support
cases, 15 recall cases, and 21 view assertions. Three broken Godot cache variants
fail their intended assertions, followed by a restored control. Raw failure output
is retained in the workflow receipts. The unchanged contact benchmark passes all
seven checksum comparisons. [Checks](checks.json) bind sources and retained logs.

Windows uses normal editor import. The complete Linux workshop still requires
explicit extension registration; it is not evidence of a normal first import.
The final local SDK archive and Windows/Linux editable projects and players are
listed with hashes in [deliveries.json](deliveries.json). These are local gameplay
candidates, separate from the public local-save addon release. The prior public
release's main and tag runs have both passed all seven hosted jobs.

The exploratory directory retains two rejected approaches: snapshot-text reuse
did not materially improve the workload, and in-place Godot decoding saved only
a few milliseconds. Exact sources are retained for the decoding and first view
experiments. The earlier text-reuse discovery receipt predates phase instrumentation;
its candidate is in the decoding source capsule. Final API medians count only
actions that call that operation, correcting the early exploratory summaries'
inclusion of zero-valued absent calls. No runtime code from either rejected
prototype was adopted.

Development failures are retained: explicit Dictionary types repaired the new
Godot probe; a fixture comparison confused integer 13 with float 13.0; the initial
projection moved the account field and was repaired before acceptance; and the
verifier initially encountered a restricted Windows temp path. Its retry uses an
owned workspace temp folder, and all five created user-temp consumers were removed.
The base bundle ceiling rises from 100 to 101 KiB (actual 103,252 bytes), and the
unminified session ceiling rises from 20 to 22 KiB (actual 21,868 bytes). The browser
bundle is 81,404 bytes and retains its existing 100 KiB limit.

See [the contract and reproduction commands](../../docs/profile-views.md) for
ownership, cache invalidation, serialization and measurement boundaries.

[Cleanup](cleanup.json) records removal of 163 owned verification directories
and the session scratch folder: 91,007 files and 1,674,150,729 bytes in total.
Five temporary consumers under the user profile were also removed. No worktrees
were created. Only the three verified SDK, Windows and Linux delivery directories
remain from this work (10 files, 83,596,269 bytes); existing worktrees and artifacts
were preserved. Docker was returned to its initially stopped state.
