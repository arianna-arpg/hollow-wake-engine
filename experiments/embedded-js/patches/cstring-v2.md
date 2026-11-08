# String cleanup contract, revision 2

This is a private qualification of the one-line cleanup patch. It does not
change the production runtime or an engine archive. Revision 1, its Windows
acceptance, the failed Linux result and both diagnostic attempts remain intact.

## Why the contract changes

Revision 1 assumed that every failed conversion could be retried successfully
in the same runtime. The Linux sanitizer build disproved that expectation.
The unmodified runtime and the cleanup candidate both lose lazily initialized
built-ins when an allocation fails during initialization. The pinned
JS_AutoInitProperty implementation clears its initializer before checking its
exception result. This source observation explains the recorded "not a function"
errors and the missing Error prefix; it is not a claim of general recovery.

The four-way diagnostic is preserved under
[evidence/native-cstring-cleanup/retry-diagnosis](../../../evidence/native-cstring-cleanup/retry-diagnosis).
Its repaired initialized build passes all 210 cases with zero tracked allocations
after destruction. Both cold builds have the same 12 observed retry failures.

The actual native host poisons itself on a script error or allocation failure,
then refuses further commands. This qualification does not broaden that promise.

## Required evidence

Each compiler configuration runs both original and repaired source, each with
210 cold cases and 210 initialized cases. Linux additionally runs both under
AddressSanitizer, UndefinedBehaviorSanitizer and leak detection.

- Every successful initial conversion must match literal encoding vectors.
  Allocation failures must have a zero returned length when a length is requested.
- Cold and initialized comparisons retain exact bytes, lengths, error message
  bytes, refusal counts and outcomes. Repaired and original observations must
  agree in full within the same compiler configuration.
- Initialized retries must also match the independent vectors. The intentionally
  throwing coercion must still report its refusal message.
- All repaired runtimes must release every tracked allocation after destruction.
  The unmodified build must expose the known leak, proving fault injection reached it.
- Sanitizers must report no repaired errors. The original sanitizer report may
  contain only the observed leaks: its total allocations and bytes must equal the
  tracked totals including allocator prefixes. Undefined behavior, access errors,
  timeouts and incomplete output fail.
- Six source-preparation faults and receipt mutation controls must be detected.
  Pinned upstream bytes and prepared bytes must remain unchanged. Private builds
  are removed in finally, including failure paths.

The NULL-length API exposes a NUL-terminated prefix without a length. The
observer checks that prefix and terminator; the subsequent length-bearing retry
checks the complete string, including embedded NUL bytes. Cold slices and ropes
remain in the course, so initialization cannot erase their coverage.

An error is inspected through its message, never Error.toString, to avoid
initializing more built-ins in the observer. These cases use built-in error
values; the observer is not a general untrusted-object serializer.

## Reproduce

Run after preparing the pinned upstream source:

    node experiments/embedded-js/patches/test-cstring-cleanup-v2.mjs --upstream <source> --output <fresh-report.json>
    node experiments/embedded-js/patches/verify-cstring-v2.mjs --report <fresh-report.json>
    node experiments/embedded-js/patches/test-cstring-v2-evidence.mjs --report <fresh-report.json>

The separate revision-2 workflow runs Windows and Linux. The old workflow remains
a historical revision-1 check until revision 2 has qualified; its known Linux
failure must not be relabeled as success.

Passing this focused contract still requires native poisoned-host destruction,
existing workload regressions, new engine archives and physical-device
measurement before any adoption or hardware-performance claim.
