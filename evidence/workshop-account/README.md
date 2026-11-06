# Inventory saves with 3,929 lore entries

The [Windows](windows.json) and [Steam Runtime 4](linux.json) runs compare two
actual Godot project packages. The same machine ran the previous build, the
candidate twice, and the previous build again. Each fresh process committed 36
skill moves per profile. The first four warmed its caches. Each report retains
the individual timings, the time spent inside SQLite staging and commit, and
the digest of the independently reopened save. The Linux editor used a
directory mounted from the Windows host. The portable player can measure the
filesystem on a handheld. The [Node run](sdk-windows.json) measures the SDK
move and detached snapshot separately.

| 95th percentile for a committed skill move | Four items, previous → candidate | 128 items, previous → candidate |
| --- | ---: | ---: |
| Windows x64 | 174 → 150 ms | 875 → 398 ms |
| Steam Runtime 4 x64 | 200 → 225 ms | 834 → 458 ms |

The Linux four-item result includes a 223 ms storage-call p95 in the candidate
run. Its time outside those calls fell from 4.1 to 2.4 ms at p95. The larger
profile still serializes a 283,729-byte checkpoint when returning the skill.

For a device run, compare the first SHA printed by `measure.sh` to
`portable.packSha256` in the Linux report. The two `saveSha256` values in its
`HWE_BENCH` line should match `portable.saves`. Keep the output with the device
model, power profile and disk location. The [device run guide](../../docs/steamrt-device-run.md)
describes the earlier crafting and progression workloads.

## Should account lore have its own database row?

In a disposable SQLite prototype, an unchanged account could be omitted from
subsequent writes. Returning a skill reduced the text supplied to the database
from 283,731 to 84,311 bytes. The staged rollback journal shrank from 17,936 to
16,928 bytes. When salvage changed lore as well, the separate-row journal grew
to 29,240 bytes versus 17,936 with the shipping layout. A fresh read-only
connection reconstructed identical checkpoints after each commit and verified
the prior inventory and account after each rollback. [Experiment results](storage-layout.json)

The smaller payload justifies testing partial updates at the host boundary.
A storage migration needs device measurements of complete transactions,
including synchronization. Journal length describes one part of a commit.
[SQLite's atomic commit sequence](https://www.sqlite.org/atomiccommit.html#single_file_commit)

Run the experiment from the built SDK checkout. It creates and removes two
temporary databases and writes its observations to a new file.

~~~sh
node scripts/probe-workshop-storage.mjs NEW_REPORT.json
~~~
