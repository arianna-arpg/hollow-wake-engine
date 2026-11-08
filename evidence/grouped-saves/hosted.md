# Hosted grouped-save qualification

The [native workflow](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42447311724)
passed on Windows 2025 x64 and Ubuntu 24.04 x64 at commit
eb6a01647063aaebe72a19f63ca29fd876288f69.

Both delivered Release libraries pass the C++/C/C# courses, six abrupt
process-exit/reopen cases, twelve store fault controls, nine worker fault
controls and compatibility in both original/current library directions.
The Linux instrumentation separately passes address, undefined-behavior and
leak checks for SQLite, the core and C consumers.

hosted.json identifies the exact libraries and retained delivery locations;
hosted-raw.json.gz contains the source-bound build, consumer, worker,
preparation and workflow receipts. The downloaded delivery files were checked
against their build receipts. The checker is
scripts/check-grouped-save-hosted-evidence.mjs.

The local Windows checkpoint remains unchanged. This hosted checkpoint does
not qualify grouped Unity/Godot coordination, ARM, physical Steam Deck/mobile
performance or physical power loss. Generated Windows/Linux deliveries remain
available locally for the next engine integration; no temporary compiler or
test projects were downloaded.
