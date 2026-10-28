using System;
using System.IO;
using System.Text.Json;
using HollowWake.Experimental;

// Tracked native heap only. Managed allocations and process memory are not equivalent counters.
static class Memory
{
    static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
    static JsonElement Call(EmbeddedLibrary.Host host, string request)
    {
        using var value = JsonDocument.Parse(host.Execute(request));
        Require(value.RootElement.GetProperty("ok").GetBoolean(), "Operation refused");
        return value.RootElement.Clone();
    }
    static int Main(string[] args)
    {
        try
        {
            Require(args.Length == 1, "One job file required");
            using var document = JsonDocument.Parse(File.ReadAllText(args[0]));
            var job = document.RootElement;
            using var library = new EmbeddedLibrary(job.GetProperty("library").GetString()!);
            using var host = library.CreateHost(File.ReadAllBytes(job.GetProperty("bundle").GetString()!),
                File.ReadAllBytes(job.GetProperty("input").GetString()!));
            var content = host.GetMetrics();
            int[] handles = new int[8];
            for (int i = 0; i < handles.Length; i++) handles[i] = Call(host,
                "{\"version\":1,\"op\":\"create\",\"config\":" + job.GetProperty("config").GetRawText() + "}")
                .GetProperty("handle").GetInt32();
            var emptyOwners = host.GetMetrics();
            foreach (int handle in handles)
            {
                string result = host.Execute($"{{\"version\":1,\"op\":\"batch\",\"handle\":{handle},\"commands\":{job.GetProperty("commands").GetRawText()}}}");
                Require(result == job.GetProperty("responseText").GetString(), "Warmed item result differs");
                string snapshot = host.Execute($"{{\"version\":1,\"op\":\"snapshot\",\"handle\":{handle}}}");
                Require(snapshot == job.GetProperty("snapshotText").GetString(), "Warmed owner state differs");
            }
            var warmedOwners = host.GetMetrics();
            foreach (int handle in handles) Call(host, $"{{\"version\":1,\"op\":\"destroy\",\"handle\":{handle}}}");
            var afterDestroy = host.GetMetrics();
            host.Dispose();
            Require(host.FinalStatus == 0 && host.FinalMetrics?.LiveBytes == 0 && host.FinalMetrics?.LiveBlocks == 0, "Native disposal");
            Console.WriteLine(JsonSerializer.Serialize(new { passed = true, owners = handles.Length,
                content, emptyOwners, warmedOwners, afterDestroy, disposed = host.FinalMetrics },
                new JsonSerializerOptions { IncludeFields = true }));
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
