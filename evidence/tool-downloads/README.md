# Pinned tool download reliability

Four workflows for the prior public commit stopped on HTTP 504 responses while
fetching Electron or Godot export templates. The exact run URLs, observed error
lines and retained-log hashes are in [the failure record](prior-failures.json).
Those failed downloads did not complete the affected platform qualifications.

The download helper makes at most three attempts for HTTP 408, 429, 500, 502,
503 or 504 responses. Ordinary backoff is one then two seconds; Retry-After
seconds or dates can increase each wait up to thirty seconds. Godot fetching shares one
ten-minute deadline across all attempts. Non-HTTP transport errors, local file
errors, checksum failures and size mismatches fail directly.

Godot downloads stream through the original pinned byte count and SHA-256
checks. Each destination is opened exclusively. An invalid or interrupted file
is removed only when this operation created it; a concurrent writer's file is
preserved. A failed preparation removes its own archives and extracted files,
retaining preparation.json for diagnosis. Successful tool installations remain
available to the subsequent build.

Electron continues to use its existing pinned installer and its own checksum
verification. The wrapper retries only explicit transient HTTP status failures
from that installer. Other exit codes, process errors and termination signals
remain failures. No version or checksum pin was loosened.

[Local qualification](local.json) passes twelve contracts, nine deliberate
faults and a restored control. The contracts exercise streamed corruption,
connection failure, exclusive file ownership, bounded delays, actual installer
child processes and isolated Godot preparation. The latter injects failed
archives/extracted files and checks that only the receipt survives. Test
consumers are removed even on failure. [Compressed logs](local.logs.json.gz)
retain the observations and assertion failures.

[Hosted qualification](hosted.json) independently checks the downloaded Windows
2025 and Ubuntu 24.04 reports from
[run 42654351904](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42654351904)
at `e082cc99dfa3e505f2207c0112bd4f1a41b93a9f`. Both platforms passed all twelve
contracts, detected all nine deliberate faults and passed the restored control.
The receipt checks source hashes, archived log hashes, named failed assertions
and scratch cleanup. [Anonymous public readback](public-readback.json) verifies
eight published source/evidence files byte for byte at that same commit.

Reproduce with `node scripts/test-tool-downloads.mjs`. It needs only Node's
built-in modules, uses isolated copies of the small scripts, and does not fetch
large engine binaries. This qualifier targets Windows/Linux x64, matching the
Godot preparation script. Ordinary portable tests skip that one integration
case on other hosts. A dedicated Windows/Linux workflow runs the same course;
the four affected consumers also run the contracts before their real tool
installation. Persistent remote failure still fails visibly after the retry
limit. Local injected failures do not prove remote availability or qualify a
game engine/device; hosted results are reported separately for their exact commit.

This checkpoint changes development tooling and workflows. The SDK runtime,
authored content, existing engine archives and original game remain as before.
