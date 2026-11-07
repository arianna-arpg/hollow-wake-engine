# Bounded background saves

This milestone moves the Godot host's durable writes to one sleeping native
worker per store. The main thread still owns gameplay, serialization and UI.
The worker receives owned bytes, retains one request or unconsumed completion,
and returns the actual transaction result. The profile publishes the new
inventory only after a successful commit; failures reload the durable owners.

The full SDK verifier passes all 1,574 tests, package consumers and deliberate
fault checks. The existing seven-round contact benchmark retains matching
checksums. The [native save measurements](../local-save-background/README.md)
show reduced main-thread occupancy, with unchanged or longer completion latency.
They exclude gameplay serialization and full-frame rendering.

[Godot local saves 0.3.0](https://github.com/arianna-arpg/hollow-wake-engine/releases/tag/godot-local-save-v0.3.0)
publishes the independent Windows/Linux addons and checksums from commit
9f3ba5f05320722f57a57f1bfee0a175ff972529. Its sole parent is the existing public
main, and all seven compiled-source hashes match the accepted builds. The
22-file public change contains only the addon, generic checks/evidence and the
worker CI step. All three uploaded asset hashes match. The full inventory
projects and player checks remain a separate local delivery.

All seven jobs in the [published-source run](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42336328376)
have passed, including the original-game reference suite, package consumers and
native worker fault checks on Windows and Linux. The follow-up receipt in
hosted-main.json records completion; publication.json preserves the earlier
publication-time snapshot. The [duplicate tag run](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42336349636)
also passed all seven jobs; hosted-tag.json retains its completion receipt.
The earlier 0.2 source commit's
branch, pull-request, tag and main runs all completed successfully.

Windows x64 and Steam Runtime 4 Linux x86_64 both pass the empty-project native
checks, full inventory background-save course, second-process reopen, and the
existing inlay course in an exported, relocated player. Windows uses normal
editor import for the complete project. Linux uses explicit extension
registration for that project; its standalone addon passes normal editor import.
The original 56-command course, 95 gear cards, skill learning, support sockets
and fifteen memory-recall cases also pass on both platforms.

Follow-up [cold-import qualification](../godot-cold-import/README.md) now verifies
the complete workshop through normal import on both platforms. The original
receipts above retain their explicit-registration scope.

The independent C++ backend holds stage/commit barriers while 20,000 polls
complete. It checks capacity, owned inputs, cancellation, single consumption,
stale tickets, error propagation and joined destruction. Eight deliberate faults
are detected on Windows. Linux also passes address, leak and undefined-behavior
sanitizers. ThreadSanitizer exits before the test with an unexpected-memory-mapping
error in this container; no race-sanitizer pass is claimed.

The real native tests include 64 accepted cancellations per platform, both
documents at the 512 KiB limit, close/reopen, competing and stale writers, and a
held reader causing commit failure with the prior revision preserved. The broader
32-run Windows inventory harness also passes, including forced termination at
three existing transaction boundaries. Those deterministic process-kill tests
exercise the synchronous transaction API shared by the worker; they are not
claimed as forced kills at specific worker-thread instructions.

Development failures are retained in the checkpoint notes: the initial Godot
checker needed an explicit Object type; a workflow observer needed UTF-8 decoding;
and the first Windows package run passed all functional checks before temporary
cleanup failed with WinError 145. The owned leftover was removed after checking
for live Godot processes. Cleanup now retries transient Windows release delays
and still reports a persistent failure. The subsequent workflow checks exercised
that cleanup successfully on both platforms.

Physical Steam Deck/mobile tests, ARM builds, larger-database stress, power-loss
qualification, whole-frame profiling and remaining engine-package families are
still open. Background saving improves the scheduling boundary; it does not
establish a device frame-time budget or make storage instantaneous.
