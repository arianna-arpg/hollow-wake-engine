# Portable reference and fault observers

The [second hosted engine run](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42409508990)
passed the Linux Node 24 package suite and both native lifecycle jobs, then
exposed two further observer issues:

- The conduit observer's virtual TypeScript program resolved ambient types
  from the SDK working directory. A developer-machine ancestor supplied Node
  declarations locally; the clean runner had only the explicitly installed
  reference tooling. Its compiler options now select Node types from that
  pinned reference-tool directory.
- On Node 22.23.4, the inherited-support fault produced a failed strict
  equality with a function-valued actual result. The child test output
  reported `ERR_TEST_FAILURE`, so the mutation harness correctly refused to
  count it as an outcome assertion. The contract now asserts the equivalent
  boolean `result === null`, keeping the error payload serializable.
  The harness still requires an assertion failure; it does not accept generic
  crashes or arbitrary test failures.

The Node 22 failure was reproduced locally before changing the observer.
Both Node versions must detect all 30 gem-residence/restoration faults after
the fix. No production runtime or accepted gameplay fixture changes.
The package matrix now retains independent Windows/Linux and Node 22/24
results when another combination fails instead of cancelling the other jobs.
