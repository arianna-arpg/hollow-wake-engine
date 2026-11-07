# Preserve Unreal replay compatibility

The [follow-up receipt](shared-verifier.json) preserves Unreal's existing
combat/pouch comparator. Unity alone requires workshop replies.

The regression test imports the real Unreal verifier's comparator and feeds
the frozen combat/pouch course without workshop files. It fails against the
initial combined comparator, then passes after the checks are separated.
Unity still rejects absent and deliberately altered workshop replies.

Run `python -I -B test/unity-gameplay/shared-replay.py` from the SDK root.
Its temporary course is removed on success and failure.

This changes verification tooling only. The accepted package, native runs,
source receipt and historical evidence from commit `7d44f8e` remain unchanged.
The follow-up receipt pins the updated verifier and regression test separately.
