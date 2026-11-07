# Resource conduit verification

Two original-game processes produced byte-identical observations for 427 courses, including 1,967 checkpoints. The reference lock covers the original Actor, skill admission and content registries. Normal verification reads the accepted observation file. The separate capture operation refuses to replace it.

The installed-package check type-checks the generated Actor binding and observer, then runs that actor against the recorded outcomes. It includes all 49 ordered pool pairs, cast modes, foreign held skills, toggles, reserved and absent pools, blocked gains, broken poise, cap edges, tree investment, socket/graft composition and worn passives. Replacing the destination-room division with multiplication changes 94 courses. The original World probes separately exercise passive allocation, save/rebuild, co-op, starter skill trees and respec.

The desktop benchmark's timed section is the conduit sweep of 24 actors with eight occupied seats, over 120 frames. Each comparison alternates execution order and includes an identical-build control. The timings cover the resource subsystem on the recorded desktop. The source-game and installed-game observations, browser checks, archive digests, checksums and individual samples are in `windows.json`.

| Workload | Original median, ms per 120 frames | SDK median, ms per 120 frames |
| --- | ---: | ---: |
| Eight idle skills | 7.05 | 0.26 |
| Mixed held and worn pumps | 22.26 | 14.58 |
| Raised guards | 63.24 | 54.48 |
| Worn pump with idle skills | 7.60 | 0.79 |

All timed runs agreed on the resulting meter checksum. The median ratios between identical builds ranged from 0.98 to 1.03. The SDK avoids resolving support admission and gathering pump specifications for inactive skills. Engaged skills continue to resolve their live build. Physical-device and complete-game frame times remain unmeasured here.

The package also ships a 2,690-byte catalogue of all 20 authored conduit sources. The reference compiler visits the original game registries and compares the shipped bytes. An additional source-side observer resolves combinations of innate pumps, actual admitted supports, passive grafts and repeated tree node occurrences. Each portable loadout must match its original ordered list.

The small offline browser course uses three original builds and compares each actor's mana, poise and shield at each checkpoint. Desktop browser acceptance downloads and compares the JSON reports, interrupts a backgrounded run and rejects a modified expected value. Device reports from the Steam Deck and older phones remain open.

## Embedded execution

The native SDK host loaded the catalogue and the three meter courses from the same verified package on Windows x64 and the pinned Steam Runtime 4 Linux x86_64 Platform. Each host matched 96 original loadout lists and 399,360 actor steps over 219 requests. With a 4 MiB limit, tracked peak allocation was 812,873 bytes on Windows and 812,857 bytes on Linux. Both runtimes released all tracked bytes at destruction. These counts describe the test runtime, catalogue and controlled actor set. Engine process memory, actual Steam client launch and target-device performance require separate measurements. See `embedded.json`.

From the SDK checkout, run `node scripts/test-embedded-conduits.mjs <verified-conduit-release> <0.57-workshop-donors> <python-executable> --steam`. It verifies the package, device page, source loadouts, native donor archives and the local pinned Steam Runtime image before replay. The Linux container runs without network access, with a read-only input mount and a temporary output filesystem. Omit `--steam` for the Windows-only check.
