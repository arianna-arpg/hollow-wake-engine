using System;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using HollowWake.Experimental;

static class Program
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern IntPtr GetModuleHandleW(string name);
    [DllImport("libdl.so.2", EntryPoint = "dlopen", ExactSpelling = true)]
    static extern IntPtr DlOpen([MarshalAs(UnmanagedType.LPUTF8Str)] string path, int flags);
    [DllImport("libdl.so.2", EntryPoint = "dlclose", ExactSpelling = true)]
    static extern int DlClose(IntPtr handle);
    static bool IsLibraryLoaded(string path)
    {
        if (OperatingSystem.IsWindows()) return GetModuleHandleW(path) != IntPtr.Zero;
        if (!OperatingSystem.IsLinux()) throw new PlatformNotSupportedException("Loader proof supports Windows and glibc Linux.");
        // glibc RTLD_NOLOAD | RTLD_LAZY: inspect residency without loading the
        // module or promoting its binding mode. A successful probe owns a
        // loader reference, so balance it before testing the next lifecycle step.
        var handle = DlOpen(path, 4 | 1);
        if (handle == IntPtr.Zero) return false;
        Require(DlClose(handle) == 0, "Residency probe releases its temporary loader reference");
        return true;
    }
    static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
    static void Disposed(Action action)
    {
        try { action(); throw new Exception("Disposed owner accepted work"); }
        catch (ObjectDisposedException) { }
    }
    static readonly byte[] Probe = Encoding.UTF8.GetBytes("var HollowWakeSession={create(){return {n:0};},dispatch(s,r){s.n+=(r.inc||0);return s.n;}};");
    static readonly byte[] Empty = Encoding.UTF8.GetBytes("{}");
    [MethodImpl(MethodImplOptions.NoInlining)]
    static WeakReference Abandon(string path)
    {
        using var library = new EmbeddedLibrary(path);
        var host = library.CreateHost(Probe, Empty);
        Require(host.Execute("{\"inc\":1}") == "1", "Abandoned host initialized");
        return new WeakReference(host);
    }
    static int Main(string[] args)
    {
        try
        {
            Require(args.Length == 5, "Library, bundle, content, requests and output required");
            string path = Path.GetFullPath(args[0]);
            Require(!IsLibraryLoaded(path), "Residency probe does not load the library");
            using (var failedCreation = new EmbeddedLibrary(path))
            {
                try { failedCreation.CreateHost(Encoding.UTF8.GetBytes("{"), Empty); throw new Exception("Invalid bundle accepted"); }
                catch (EmbeddedLibrary.NativeException error) { Require(error.Status == 4, "Construction error status"); }
                var invalid = EmbeddedLibrary.Options.Default; invalid.Reserved = 1;
                try { failedCreation.CreateHost(Probe, Empty, invalid); throw new Exception("Invalid options accepted"); }
                catch (EmbeddedLibrary.NativeException error) { Require(error.Status == 1, "Options error status"); }
            }
            Require(!IsLibraryLoaded(path), "Failed construction releases library leases");
            using var library = new EmbeddedLibrary(path);
            using var host = library.CreateHost(File.ReadAllBytes(args[1]), File.ReadAllBytes(args[2]));
            int requests = 0;
            using (var output = new StreamWriter(args[4], false, new UTF8Encoding(false, true)))
            {
                foreach (string request in File.ReadLines(args[3])) { output.WriteLine(host.Execute(request)); requests++; }
            }
            using var probe = library.CreateHost(Probe, Empty);
            library.Dispose();
            Require(IsLibraryLoaded(path), "Library lease survives public owner disposal");
            Disposed(() => library.CreateHost(Probe, Empty));
            Require(probe.Execute("{}") == "0", "Existing host works after library disposal");
            var responses = new string[2];
            var errors = new Exception?[2];
            var threads = Enumerable.Range(0, 2).Select(i => new Thread(() =>
            {
                try { responses[i] = probe.Execute("{\"inc\":1}"); } catch (Exception error) { errors[i] = error; }
            }, 2 * 1024 * 1024)).ToArray();
            foreach (var thread in threads) thread.Start();
            foreach (var thread in threads) thread.Join();
            Require(errors.All(error => error is null) && responses.Order().SequenceEqual(new[] { "1", "2" }), "Managed callers serialize across native threads");
            Require(probe.Execute("{}") == "2", "Thread continuation");
            probe.Dispose(); probe.Dispose();
            Disposed(() => probe.Execute("{}")); Disposed(probe.Cancel);
            host.Dispose();
            var final = host.FinalMetrics;
            Require(host.FinalStatus == 0 && final.HasValue && final.Value.LiveBytes == 0 && final.Value.LiveBlocks == 0, "Game host disposal has no tracked allocations");
            Require(probe.FinalStatus == 0 && probe.FinalMetrics?.LiveBytes == 0, "Probe disposal has no tracked allocations");
            Require(!IsLibraryLoaded(path), "Last host releases the native library");
            var abandoned = Abandon(path);
            GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect(); GC.WaitForPendingFinalizers();
            Require(!abandoned.IsAlive && !IsLibraryLoaded(path), "SafeHandle finalization releases host and library");
            using (var reloaded = new EmbeddedLibrary(path))
            using (var fresh = reloaded.CreateHost(Probe, Empty))
            {
                Require(fresh.Execute("{}") == "0", "Fresh state after reload");
                fresh.Cancel();
                try { fresh.Execute("{}"); throw new Exception("Cancellation ignored"); }
                catch (EmbeddedLibrary.NativeException error) { Require(error.Status == 10, "Native cancellation status"); }
                Require(fresh.GetMetrics().Poisoned == 1, "Cancelled host cannot continue");
            }
            Require(!IsLibraryLoaded(path), "Reloaded library unloads");
            Console.WriteLine(JsonSerializer.Serialize(new { passed = true, requests,
                liveBytesAfterDispose = final!.Value.LiveBytes, liveBlocksAfterDispose = final.Value.LiveBlocks,
                peakTrackedBytes = final.Value.PeakBytes, managedOwnership = true, threadMigration = true,
                libraryLease = true, failedConstructionLease = true, finalizerUnload = true, unloadReload = true,
                residencyProbe = OperatingSystem.IsWindows() ? "GetModuleHandleW" : "glibc RTLD_NOLOAD | RTLD_LAZY" }));
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
