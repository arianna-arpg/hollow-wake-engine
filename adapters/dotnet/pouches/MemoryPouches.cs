using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using HollowWake.Experimental;

namespace HollowWake.Pouches;

/// <summary>The host owns the inventory and any previous recall metadata.
/// Level is the greater of the current zone level and the acting hero's level.</summary>
public readonly record struct RecallProfile(JsonElement State, int Level, bool Sealed = false, JsonElement? Memory = null);

/// <summary>Calls the standalone SDK using ordinary JSON and an instance-owned
/// native runtime. A successful Recall returns a proposal for the host's save transaction.</summary>
public sealed class MemoryPouches : IDisposable
{
    private readonly EmbeddedLibrary library;
    private readonly EmbeddedLibrary.Host host;
    public string ContentId { get; }

    public MemoryPouches(string? assetsDirectory = null)
    {
        if (!OperatingSystem.IsWindows() || RuntimeInformation.ProcessArchitecture != Architecture.X64)
            throw new PlatformNotSupportedException("This package includes the Windows x64 native runtime.");
        string directory = Path.GetFullPath(assetsDirectory ?? Path.Combine(AppContext.BaseDirectory, "HollowWake.Pouches"));
        using var manifest = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(directory, "manifest.json")));
        ContentId = manifest.RootElement.GetProperty("contentId").GetString() ?? throw new InvalidDataException("Missing pouch content identity");
        JsonElement files = manifest.RootElement.GetProperty("files");
        void Verify(string name, byte[] digest)
        {
            string actual = Convert.ToHexString(digest);
            if (!String.Equals(actual, files.GetProperty(name).GetString(), StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"Mismatched pouch asset: {name}");
        }
        byte[] ReadVerified(string name)
        {
            byte[] bytes = File.ReadAllBytes(Path.Combine(directory, name));
            Verify(name, SHA256.HashData(bytes));
            return bytes;
        }
        var code = ReadVerified("pouch-rules.js");
        var data = ReadVerified("pouch-data.json");
        string libraryPath = Path.Combine(directory, "hwe_embedded.dll");
        using var libraryFile = File.OpenRead(libraryPath);
        Verify("hwe_embedded.dll", SHA256.HashData(libraryFile));
        library = new EmbeddedLibrary(libraryPath);
        try
        {
            var options = EmbeddedLibrary.Options.Default;
            options.HeapLimitBytes = 12 * 1024 * 1024;
            host = library.CreateHost(code, data, options);
        }
        catch { library.Dispose(); throw; }
    }

    /// <summary>Returns the current FIFO groups, applicable facets and refusal, if any.</summary>
    public JsonElement Inspect(RecallProfile profile, long uid) => Execute(new {
        op = "view", uid, state = profile.State, level = profile.Level, @sealed = profile.Sealed, memory = profile.Memory
    });

    /// <summary>Import an existing character's actual unlocks and lesson ledger.
    /// Subsequent successful recalls return an updated memory value to save.</summary>
    public JsonElement CreateMemory(IEnumerable<string> unlockedSkills, IEnumerable<string> unlockedSupports,
        IEnumerable<string>? secondary = null, JsonElement? seatLedger = null)
    {
        var memory = JsonSerializer.SerializeToElement(new {
            content = ContentId, skills = unlockedSkills, supports = unlockedSupports,
            secondary = secondary ?? Array.Empty<string>(), seatLedger = seatLedger ?? JsonSerializer.SerializeToElement(new {})
        });
        var reply = Execute(new { op = "validate", memory });
        if (!reply.GetProperty("ok").GetBoolean()) throw new ArgumentException("Invalid memory unlocks or player ledger");
        return memory;
    }

    /// <summary>Never writes the supplied state. On success, commit items, nextUid,
    /// ledger and memory together against the revision that was displayed.</summary>
    public JsonElement Recall(RecallProfile profile, long uid, string group, long nextUid, string? facet = null)
    {
        // Missing facet is an absent property in the command contract.
        var request = new RecallRequest("recall", uid, group, nextUid, facet, profile.State, profile.Level, profile.Sealed, profile.Memory);
        return Execute(request);
    }

    private sealed record RecallRequest(string op, long uid, string group, long nextUid,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? facet,
        JsonElement state, int level, bool @sealed, JsonElement? memory);

    private JsonElement Execute<T>(T request)
        => JsonSerializer.Deserialize<JsonElement>(host.Execute(JsonSerializer.Serialize(request)));

    public ulong PeakEmbeddedBytes => host.GetMetrics().PeakBytes;
    public ulong? ReleasedLiveBytes => host.FinalMetrics?.LiveBytes;
    public void Dispose()
    {
        host.Dispose();
        library.Dispose();
    }
}
