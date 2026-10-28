using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace HollowWake.Experimental;

// Development binding for the experimental C ABI; no Unity/IL2CPP claim.
public sealed unsafe class EmbeddedLibrary : IDisposable
{
    public const uint AbiVersion = 0x00010000;
    [StructLayout(LayoutKind.Sequential)]
    public struct Options
    {
        public uint AbiVersion, Reserved;
        public ulong HeapLimitBytes;
        public uint MaxRequestBytes, MaxResponseBytes, InterruptPolls, Reserved2;
        public static Options Default => new()
        {
            AbiVersion = EmbeddedLibrary.AbiVersion, HeapLimitBytes = 256UL * 1024 * 1024,
            MaxRequestBytes = 1024 * 1024, MaxResponseBytes = 4 * 1024 * 1024, InterruptPolls = 1000000
        };
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct Metrics
    {
        public ulong LiveBytes, PeakBytes, LiveBlocks, Allocations;
        public uint ResponsePending, Poisoned, CancellationRequested, Reserved;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Layout { public uint Version, OptionsSize, MetricsSize, PointerSize; }
    public sealed class NativeException : Exception
    {
        public int Status { get; }
        internal NativeException(int status) : base($"Embedded runtime operation failed (status {status}); no rollback is implied.") { Status = status; }
    }
    private static void Check(int status) { if (status != 0) throw new NativeException(status); }
    private static readonly UTF8Encoding Utf8 = new(false, true);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int LayoutCall(out Layout output);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int CreateCall(Options* options, byte* bundle, ulong bundleLength, byte* content, ulong contentLength, out IntPtr host);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int SubmitCall(IntPtr host, byte* request, ulong requestLength, out ulong responseLength);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int CopyCall(IntPtr host, byte* output, ulong capacity, out ulong written);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int HostCall(IntPtr host);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int MetricsCall(IntPtr host, out Metrics output);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int DestroyCall(ref IntPtr host, out Metrics output);
    private readonly LibraryHandle library;
    private readonly CreateCall create;
    private readonly SubmitCall submit;
    private readonly CopyCall copy;
    private readonly HostCall release, cancel;
    private readonly MetricsCall metrics;
    private readonly DestroyCall destroy;
    private readonly object gate = new();
    private bool disposed;

    private sealed class LibraryHandle : SafeHandle
    {
        internal LibraryHandle(string path) : base(IntPtr.Zero, true) { SetHandle(NativeLibrary.Load(path)); }
        public override bool IsInvalid => handle == IntPtr.Zero;
        protected override bool ReleaseHandle() { NativeLibrary.Free(handle); return true; }
    }
    internal sealed class HostHandle : SafeHandle
    {
        private readonly EmbeddedLibrary owner;
        internal Metrics FinalMetrics;
        internal int FinalStatus, ReleaseCompleted;
        internal HostHandle(EmbeddedLibrary owner) : base(IntPtr.Zero, true) { this.owner = owner; }
        internal void Adopt(IntPtr value) { SetHandle(value); }
        public override bool IsInvalid => handle == IntPtr.Zero;
        protected override bool ReleaseHandle()
        {
            // Every native call holds a SafeHandle lease. The library lease is
            // released only after the host destructor has returned from native code.
            var owned = handle;
            try
            {
                FinalStatus = owner.destroy(ref owned, out FinalMetrics);
                Volatile.Write(ref ReleaseCompleted, 1);
                return FinalStatus == 0;
            }
            finally
            {
                // A failed destructor that retains ownership must also retain
                // the module. Leaking that lease is safer than unloading live code.
                if (owned == IntPtr.Zero) owner.library.DangerousRelease();
            }
        }
    }
    public EmbeddedLibrary(string absolutePath)
    {
        if (!System.IO.Path.IsPathFullyQualified(absolutePath)) throw new ArgumentException("Use an absolute library path.", nameof(absolutePath));
        library = new LibraryHandle(absolutePath);
        try
        {
            T Load<T>(string name) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(library.DangerousGetHandle(), name));
            Check(Load<LayoutCall>("hwe_js_layout_v1")(out var layout));
            if (layout.Version != AbiVersion || layout.OptionsSize != Marshal.SizeOf<Options>() ||
                layout.MetricsSize != Marshal.SizeOf<Metrics>() || layout.PointerSize != IntPtr.Size)
                throw new InvalidOperationException("Native ABI layout does not match this binding.");
            create = Load<CreateCall>("hwe_js_create_v1"); submit = Load<SubmitCall>("hwe_js_submit_v1");
            copy = Load<CopyCall>("hwe_js_copy_response_v1"); release = Load<HostCall>("hwe_js_release_response_v1");
            cancel = Load<HostCall>("hwe_js_cancel_v1"); metrics = Load<MetricsCall>("hwe_js_metrics_v1");
            destroy = Load<DestroyCall>("hwe_js_destroy_v1");
        }
        catch { library.Dispose(); throw; }
    }
    public Host CreateHost(ReadOnlySpan<byte> bundle, ReadOnlySpan<byte> content, Options? options = null)
    {
        lock (gate)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            bool lease = false, transferred = false;
            IntPtr native = IntPtr.Zero;
            try
            {
                library.DangerousAddRef(ref lease);
                var handle = new HostHandle(this);
                var host = new Host(this, handle);
                var settings = options.GetValueOrDefault();
                fixed (byte* bundlePointer = bundle, contentPointer = content)
                    Check(create(options.HasValue ? &settings : null, bundlePointer, (ulong)bundle.Length, contentPointer, (ulong)content.Length, out native));
                if (native == IntPtr.Zero) throw new InvalidOperationException("Native construction returned no owner.");
                handle.Adopt(native); transferred = true;
                return host;
            }
            finally
            {
                if (!transferred)
                {
                    if (native != IntPtr.Zero) destroy(ref native, out _);
                    if (lease) library.DangerousRelease();
                }
            }
        }
    }
    public void Dispose()
    {
        lock (gate) { if (disposed) return; disposed = true; library.Dispose(); }
    }

    public sealed class Host : IDisposable
    {
        private readonly EmbeddedLibrary owner;
        private readonly HostHandle handle;
        private readonly object gate = new();
        internal Host(EmbeddedLibrary owner, HostHandle handle) { this.owner = owner; this.handle = handle; }
        public Metrics? FinalMetrics => Volatile.Read(ref handle.ReleaseCompleted) == 0 ? null : handle.FinalMetrics;
        public int? FinalStatus => Volatile.Read(ref handle.ReleaseCompleted) == 0 ? null : handle.FinalStatus;
        public string Execute(string request)
        {
            byte[] input = Utf8.GetBytes(request);
            lock (gate)
            {
                bool lease = false;
                try
                {
                    handle.DangerousAddRef(ref lease);
                    var native = handle.DangerousGetHandle();
                    ulong length;
                    fixed (byte* pointer = input) Check(owner.submit(native, pointer, (ulong)input.Length, out length));
                    bool copied = false;
                    try
                    {
                        byte[] output = new byte[checked((int)length)];
                        fixed (byte* pointer = output)
                        {
                            Check(owner.copy(native, pointer, (ulong)output.Length, out var written));
                            if (written != length) throw new InvalidOperationException("Native response length changed.");
                        }
                        string result = Utf8.GetString(output);
                        copied = true;
                        return result;
                    }
                    finally
                    {
                        int released = owner.release(native);
                        // After a successful submit, a lost response cannot be
                        // silently retried. Close this owner if delivery failed.
                        if (!copied || released != 0) handle.Dispose();
                        if (copied) Check(released);
                    }
                }
                finally { if (lease) handle.DangerousRelease(); }
            }
        }
        public Metrics GetMetrics()
        {
            lock (gate)
            {
                bool lease = false;
                try { handle.DangerousAddRef(ref lease); Check(owner.metrics(handle.DangerousGetHandle(), out var result)); return result; }
                finally { if (lease) handle.DangerousRelease(); }
            }
        }
        // Deliberately does not take the operation lock: cancellation must be
        // able to reach a running call. Its lease still excludes destruction.
        public void Cancel()
        {
            bool lease = false;
            try { handle.DangerousAddRef(ref lease); Check(owner.cancel(handle.DangerousGetHandle())); }
            finally { if (lease) handle.DangerousRelease(); }
        }
        public void Dispose() { lock (gate) handle.Dispose(); }
    }
}
