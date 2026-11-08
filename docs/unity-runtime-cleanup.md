# Install the Unity gameplay preview

This page records the 0.4.1 cleanup checkpoint. For the newer shared-account
packages, use the [current installation guide](unity-shared-account.md).

Download [gameplay 0.4.1](https://github.com/arianna-arpg/hollow-wake-engine/releases/tag/unity-runtime-cleanup-v0.4.1-preview.1)
and install `com.hollowwake.gameplay-0.4.1-preview.1.tgz` using **Window → Package
Manager → + → Add package from tarball**. The accepted target is Unity
2021.3.6f1, Windows x64 Editor and Windows x64 Standalone with Mono.

Import **Casting and Burning** from the package's Samples section and open
**Ruin Encounter**. Use **Cast Ruin** to try casting and timed damage; the
inventory workshop can forge, inlay and restore an in-memory checkpoint.
Attach `AccountProgressionExample` to an active GameObject to try account
purchases, memory rewards and saved continuation. The sample grants example
credits; a real game supplies its own authorized earnings.

For disk saves, also install the unchanged [storage 0.3 preview](https://github.com/arianna-arpg/hollow-wake-engine/releases/tag/unity-account-storage-v0.3.0-preview.1)
and import **Durable Account**. This coordinator publishes paired account and
inventory changes after an atomic save. See the [account/storage contract](unity-account-storage.md)
for authorization, cancellation and failure recovery. The storage package is
optional; importing it does not connect an existing scene automatically.

The [gameplay API guide](../adapters/unity/README.md) documents the unchanged
binding. Its older release pointers are historical; use the versions above.
The 0.4.1 archive preserves all 0.4 scripts, authored content, asset identifiers
and notices. It replaces the native DLL, updates the package version, and adds
an ignored native-build provenance document. The TypeScript SDK's newer shared
account owner is a separate capability and is not introduced by this patch.

The repair releases tracked allocations after the tested CString
allocation-failure path. A failed native owner still has to be discarded and
restored from an authoritative checkpoint. Collection is available in the C ABI;
the Unity binding does not invoke it automatically. A VM memory cap excludes
Unity, managed allocations and allocator overhead.

The exact archive passed editor and relocated player checks for progression,
combat, pouches, workshop, equipment publication and durable paired saves.
[Evidence and reproduction](../evidence/unity-runtime-cleanup/README.md) record
the original and repaired failure, complete replies and damaged-input controls.
Linux Unity, IL2CPP, ARM, physical Steam Deck and mobile qualification remain open.

Archive SHA-256:
`4fc024e559794f7be7da42f31331b831a7102474cd3355736c94da1966523303`

Native DLL SHA-256:
`d2562c18b9bfe114b9e674b563332323a4c58da7935c87be380a1dcd8137ca3b`
