using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using HollowWake.Experimental;

static class Worker
{
    sealed class Inputs
    {
        public byte[]? Bundle;
        public byte[]? Content;
    }
    [MethodImpl(MethodImplOptions.NoInlining)]
    static EmbeddedLibrary.Host CreateHost(EmbeddedLibrary library, Inputs inputs) => library.CreateHost(inputs.Bundle!, inputs.Content!);
    static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
    static readonly JsonSerializerOptions JsonOptions = new() { IncludeFields = true };
    static void Emit(object value) { Console.WriteLine(JsonSerializer.Serialize(value, JsonOptions)); }
    static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
    static void Stage(string name, object? extra = null)
    {
        Emit(new { type = "stage", stage = name, managedHeapBytes = GC.GetTotalMemory(false), extra });
        Require(Console.ReadLine() == "continue", "Memory observer acknowledgement");
    }
    static JsonElement Call(EmbeddedLibrary.Host host, string request)
    {
        using var value = JsonDocument.Parse(host.Execute(request));
        Require(value.RootElement.GetProperty("ok").GetBoolean(), "Protocol operation refused");
        return value.RootElement.Clone();
    }
    static int Create(EmbeddedLibrary.Host host, JsonElement config) =>
        Call(host, "{\"version\":1,\"op\":\"create\",\"config\":" + config.GetRawText() + "}").GetProperty("handle").GetInt32();
    static void Destroy(EmbeddedLibrary.Host host, int handle) => Call(host, $"{{\"version\":1,\"op\":\"destroy\",\"handle\":{handle}}}");
    static string Snapshot(EmbeddedLibrary.Host host, int handle) => host.Execute($"{{\"version\":1,\"op\":\"snapshot\",\"handle\":{handle}}}");
    static double? Duration(bool measured, long before) => measured ? (Stopwatch.GetTimestamp() - before) * 1e9 / Stopwatch.Frequency : null;

    [MethodImpl(MethodImplOptions.NoInlining)]
    static double? Run(JsonElement job)
    {
        bool measured = !job.GetProperty("verifyOnly").GetBoolean();
        string mode = job.GetProperty("mode").GetString()!;
        var inputs = new Inputs { Bundle = File.ReadAllBytes(job.GetProperty("bundle").GetString()!),
            Content = File.ReadAllBytes(job.GetProperty("input").GetString()!) };
        if (mode == "memory") Stage("inputs-loaded");
        long began = measured ? Stopwatch.GetTimestamp() : 0;
        using var library = new EmbeddedLibrary(job.GetProperty("library").GetString()!);
        using var host = CreateHost(library, inputs);
        double? initializationNs = Duration(measured, began);
        var config = job.GetProperty("config");
        if (mode == "memory")
        {
            Stage("content-loaded", new { initializationNs, callerInputsRetained = true, native = host.GetMetrics() });
            inputs.Bundle = inputs.Content = null;
            GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect();
            Stage("content-after-input-release-gc", new { callerInputsRetained = false, native = host.GetMetrics() });
            int[] handles = new int[8]; handles[0] = Create(host, config);
            Stage("one-session", new { native = host.GetMetrics() });
            for (int i = 1; i < handles.Length; i++) handles[i] = Create(host, config);
            Stage("eight-sessions", new { native = host.GetMetrics() });
            Call(host, $"{{\"version\":1,\"op\":\"batch\",\"handle\":{handles[0]},\"commands\":{job.GetProperty("active").GetRawText()}}}");
            string? checkpoint = Snapshot(host, handles[0]);
            Require(checkpoint == job.GetProperty("checkpointText").GetString(), "Active checkpoint differs");
            Stage("checkpoint-retained", new { checkpointBytes = Encoding.UTF8.GetByteCount(checkpoint), native = host.GetMetrics() });
            foreach (int handle in handles) Destroy(host, handle);
            host.Dispose(); library.Dispose();
            Require(host.FinalStatus == 0 && host.FinalMetrics?.LiveBytes == 0 && host.FinalMetrics?.LiveBlocks == 0, "Native disposal");
            // The holder keeps input bytes live until the explicit release above.
            // Leave this frame before taking disposal/collection readings.
            GC.KeepAlive(inputs); GC.KeepAlive(checkpoint);
            return initializationNs;
        }
        var plan = job.GetProperty("plan");
        int warmups = measured ? plan.GetProperty("warmups").GetInt32() : 0;
        int samples = measured ? plan.GetProperty("samples").GetInt32() : 1;
        var test = mode == "throughput" ? job.GetProperty("case") : default;
        string checkpointText = job.GetProperty("checkpointText").GetString()!;
        string restoreRequest = "{\"version\":1,\"op\":\"restore\",\"snapshot\":" + job.GetProperty("checkpoint").GetProperty("snapshot").GetRawText() + "}";
        for (int iteration = 0; iteration < warmups + samples; iteration++)
        {
            int handle = 0;
            string[] requests = Array.Empty<string>(), expected = Array.Empty<string>(), responses;
            if (mode == "throughput")
            {
                handle = Create(host, config);
                if (test.GetProperty("setup").GetArrayLength() > 0)
                    Call(host, $"{{\"version\":1,\"op\":\"batch\",\"handle\":{handle},\"commands\":{test.GetProperty("setup").GetRawText()}}}");
                int batchSize = test.GetProperty("batchSize").GetInt32();
                string[] commands = test.GetProperty("commands").EnumerateArray().Select(command => command.GetRawText()).ToArray();
                requests = new string[commands.Length / batchSize];
                for (int i = 0; i < requests.Length; i++)
                    requests[i] = $"{{\"version\":1,\"op\":\"batch\",\"handle\":{handle},\"commands\":[{string.Join(",", commands.Skip(i * batchSize).Take(batchSize))}]}}";
                expected = test.GetProperty("responseTexts").EnumerateArray().Select(value => value.GetString()!).ToArray();
                responses = new string[requests.Length];
            }
            else { Require(mode == "checkpoint", "Unknown workload"); responses = new string[plan.GetProperty("checkpointRounds").GetInt32()]; }
            var nativeBefore = host.GetMetrics();
            int[] collections = { GC.CollectionCount(0), GC.CollectionCount(1), GC.CollectionCount(2) };
            long managedBefore = GC.GetTotalAllocatedBytes(true);
            began = measured ? Stopwatch.GetTimestamp() : 0;
            if (mode == "throughput") for (int i = 0; i < requests.Length; i++) responses[i] = host.Execute(requests[i]);
            else for (int i = 0; i < responses.Length; i++)
            {
                int restored = Call(host, restoreRequest).GetProperty("handle").GetInt32();
                responses[i] = Snapshot(host, restored); Destroy(host, restored);
            }
            double? elapsedNs = Duration(measured, began);
            long managedAfter = GC.GetTotalAllocatedBytes(true);
            int[] collectionDeltas = { GC.CollectionCount(0) - collections[0], GC.CollectionCount(1) - collections[1], GC.CollectionCount(2) - collections[2] };
            var nativeAfter = host.GetMetrics();
            string snapshot;
            if (mode == "throughput")
            {
                Require(responses.SequenceEqual(expected, StringComparer.Ordinal), "Batch observations differ");
                snapshot = Snapshot(host, handle);
                Require(snapshot == test.GetProperty("snapshotText").GetString(), "Final state differs"); Destroy(host, handle);
            }
            else { Require(responses.All(response => response == checkpointText), "Checkpoint round trip differs"); snapshot = checkpointText; }
            Emit(new { type = "sample", warmup = iteration < warmups, iteration, elapsedNs,
                calls = mode == "throughput" ? responses.Length : responses.Length * 3,
                commands = mode == "throughput" ? (int?)test.GetProperty("commands").GetArrayLength() : null,
                responseBytes = responses.Sum(response => Encoding.UTF8.GetByteCount(response)),
                observationsSha256 = Hash(string.Join("\n", responses)), snapshotSha256 = Hash(snapshot),
                managedAllocatedBytes = managedAfter - managedBefore, collectionDeltas,
                trackedNativeNewAllocations = nativeAfter.Allocations - nativeBefore.Allocations,
                trackedNativeLiveDeltaBytes = (long)nativeAfter.LiveBytes - (long)nativeBefore.LiveBytes,
                exactResponses = true });
        }
        host.Dispose();
        Require(host.FinalStatus == 0 && host.FinalMetrics?.LiveBytes == 0 && host.FinalMetrics?.LiveBlocks == 0, "Native disposal");
        GC.KeepAlive(inputs);
        return initializationNs;
    }
    static int Main(string[] args)
    {
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllBytes(args[0]));
            var job = document.RootElement;
            Stage("worker-ready", new { runtime = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
                Stopwatch.Frequency, Stopwatch.IsHighResolution });
            double? initializationNs = Run(job);
            string mode = job.GetProperty("mode").GetString()!;
            if (mode == "memory")
            {
                Stage("disposed");
                GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect();
                Stage("after-explicit-gc");
            }
            Emit(new { type = "complete", passed = true, mode, initializationNs }); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
