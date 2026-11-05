# Hosted process-output recovery

The v0.42 Windows continuity job completed successfully. Its Linux counterpart matched the original character observations, detected all 25 installed continuity faults, and passed the positive sustain course. Three sustain faults returned successfully. The fourth produced the expected random-schedule assertion and its completed verification file, then the outer observer reported an eight-minute timeout.

The retained Linux log and verification record identify output collection as the remaining suspected cause. Node's synchronous process implementation includes handling for inherited output descriptors that remain open after the direct child exits. A recent upstream report describes the same completed-child and timeout combination on Linux. [Node implementation](https://github.com/nodejs/node/blob/v24.x/src/spawn_sync.cc), [upstream report](https://github.com/nodejs/node/issues/67197)

The observer now supplies file descriptors for its output and reads the recorded log after the process returns. Each process must satisfy its timeout, exit-status and signal checks. Deliberate faults must also produce their expected assertion text and a failed verification record whose input-preservation checks succeeded. Process status, signal, error code and elapsed time are retained for each case.

The explicit worker-disconnection and termination checks passed locally and in both hosted jobs. The first hosted rerun completed three fault cases on Linux before its final output-capture timeout.

Local file-output controls exercised successful completion, a deliberate nonzero exit and a genuinely timed-out process. The real positive course and four deliberate fault courses were repeated with the revised observer. Hosted confirmation is recorded separately in the follow-up workflow artifacts.

The v0.42 SDK archive is verified by its recorded SHA-256 value in the recovery receipt. The raw hosted failure, the partial recovery and the follow-up checks are available as separate evidence.
