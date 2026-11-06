using System;
using System.Text.Json;
using HollowWake.Pouches;

using var pouches = new MemoryPouches();
var state = JsonSerializer.Deserialize<JsonElement>("""
    {"board":{"w":1,"h":1},"account":{"ledger":{},"features":[],"progression":true},
     "items":[{"uid":1,"baseId":"preformed_memory","x":0,"y":0,"mem":[{"d":"crypt_lich","s":4294967295}]}]}
    """);
var profile = new RecallProfile(state, 10);
var panel = pouches.Inspect(profile, 1);
var group = panel.GetProperty("view").GetProperty("groups")[0].GetProperty("key").GetString()!;
var facet = panel.GetProperty("facets")[0].GetProperty("id").GetString();
var outcome = pouches.Recall(profile, 1, group, 2, facet);
Console.WriteLine(outcome.GetProperty("result"));
