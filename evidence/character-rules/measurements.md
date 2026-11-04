# Measuring the character rules


With a prepared game location, use the following commands to reproduce timing and allocation results.

```sh
node scripts/benchmark-character-rules.mjs --location .artifacts/adapter-location.json
node scripts/benchmark-character-rules.mjs --location .artifacts/adapter-location.json --control
node scripts/profile-character-kits.mjs --location .artifacts/adapter-location.json
```

The identical-build timing control measures variation. The V8 allocation profile includes collected objects and must detect a known discarded allocation in each process. It measures allocations under the kit query loop, including roster traversal. These desktop runs do not establish a Steam Deck or phone frame budget. [Heap sampling protocol](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/#method-startSampling)
