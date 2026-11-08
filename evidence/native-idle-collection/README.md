# Native idle collection checkpoint

The current development C library adds an explicit idle operation. Existing
automatic scheduling, ABI layouts and published engine archives are unchanged.
The [contract](../../docs/native-idle-collection.md) defines ownership, refused
states, weak references and terminal asynchronous/exception failures.

The Windows x64 test loads the rebuilt DLL dynamically and runs both the existing
C++ ABI contracts and new collection checks. A separate executable injects six
boundary states, including allocation failure without a queued job and
cancellation during collection/accounting. Seven deliberately broken versions
are rejected at their intended assertions. A forced preparation failure also
removes its temporary directory.

Each of six fresh processes repeats the public workshop's frozen 56 original
requests eight times after two configuration commands: 450 replies per
run. The workload includes crafting, equipment, save/restore, RNG continuation,
support overflow, salvage, large item identities and profile lifecycle.
All 2,688 original workshop replies match, and all 12 configuration replies
succeed. The six complete response streams have identical hashes. Every host
closes with zero tracked bytes and blocks.

| Schedule | After configuration collection | End of eight courses | Peak tracked bytes |
| --- | ---: | ---: | ---: |
| Existing automatic collection | 28,660,357 | 18,623,461 | 32,811,005 |
| Once after configuration | 18,554,661 | 27,065,749 | 31,332,173 |
| After every released reply (stress test) | Not a comparable single boundary | 18,603,157 | 30,947,365 |

Both balanced repetitions produce the same allocation counts and reply digest.
The once-after-configuration schedule lowers this workload's peak by 1,478,832
bytes, but retains **8,442,288 more bytes at the end**. The content-loading peak
still cannot fall below the observed 30,947,365 bytes. These mixed results are
why the operation remains explicit and engine packages do not automatically
enable it. Collection after every reply is a correctness stress test.

Measurements cover requested bytes charged to the VM allocator, excluding its
allocation prefixes, system allocator overhead, caller buffers and the game
engine. No elapsed-time measurement was accepted. This is not Steam Deck/mobile
performance evidence or Unity/Godot/Unreal package qualification.

Reproduce using the pinned QuickJS-NG 0.17 sources and exact public archive:

~~~text
node scripts/test-native-idle-collection.mjs --amalgam-dir <pinned-source> --package <com.hollowwake.gameplay-0.2.0-preview.1.tgz> --python <python> --output <fresh-report.json>
node scripts/check-native-idle-evidence.mjs
~~~

The driver records hashes, compiler commands and fault assertions, then removes
all of its build/replay files. Linux CI runs the same course plus address,
undefined-behavior and leak sanitizers. Hosted results are separate from this
accepted Windows observation.

The first hosted Linux run at `d8eda7b` completed the release-build courses
and all injected/fault cases but timed out during its instrumented consumer.
Its failed receipt is retained as `linux-first-failure.json`; it is not a
sanitizer acceptance. The updated driver retains stage progress and allows ten
minutes for that complete instrumented course. The refreshed Windows run
preserves every reply digest and allocation observation above.

The [hosted rerun](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42442109695)
at `d478454871039cd18c8181de896ce715b757b48f` passed on Windows and Linux.
`linux.json`, `hosted-windows.json` and their compressed raw receipts bind the
same source hashes to six replays, six state injections and seven fault controls.
The Linux address/undefined-behavior/leak-instrumented consumer also completed
all 450 requests with the exact accepted digest and zero tracked disposal bytes.
`hosted-run.json` records both successful jobs. This adds cross-platform
correctness evidence; it makes no new timing or device-performance claim.

The complete `npm run verify` SDK regression suite passed; its source map and
log digest are retained in `sdk-verification.json`. After verification, 68
owned consumer directories (9,617 files; 333,992,810 bytes) were removed.
Their compressed receipts remain locally in an 869,220-byte archive. No
worktree was created or removed.

The original SDK receipt is now preserved as
`sdk-verification-before-shared-account.json`. Adding the optional shared-account
export changed `package.json` while every recorded native input stayed identical.
The current SDK gate uses the completed verification from the shared-account
checkpoint, including its full source map and log digest. Its provenance links
that receipt and preserves the previous bytes. This is a newer executed SDK
verification; the native observations and original-game fixtures were not rerun
or rewritten to manufacture a passing result.
