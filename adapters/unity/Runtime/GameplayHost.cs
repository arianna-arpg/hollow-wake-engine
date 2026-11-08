using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace HollowWake.Gameplay
{
    /// <summary>One independent native SDK instance. Open on Unity's main thread.
    /// Dispose it when its owning scene or service ends.</summary>
    public sealed unsafe class GameplayHost : IDisposable
    {
        const int RequestLimit = 1024 * 1024;
        const int ResponseLimit = 4 * 1024 * 1024;
        const uint Abi = 0x10000;
        const string Library = "hwe_embedded";
        static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
        static readonly HashSet<GameplayHost> Live = new HashSet<GameplayHost>();
        readonly object gate = new object();
        byte[] inputBuffer = new byte[256], outputBuffer = new byte[512];
        IntPtr handle;
        public struct Traffic { public ulong Requests, RequestBytes, ResponseBytes; }
        Traffic traffic;

        [StructLayout(LayoutKind.Sequential)]
        struct Options { public uint abi, reserved; public ulong heap; public uint request, response, polls, reserved2; }
        [StructLayout(LayoutKind.Sequential)]
        struct Layout { public uint abi, options, metrics, pointer; }
        [StructLayout(LayoutKind.Sequential)]
        public struct Metrics
        {
            public ulong LiveBytes, PeakBytes, LiveBlocks, Allocations;
            public uint ResponsePending, Poisoned, CancellationRequested, Reserved;
        }
        [DllImport(Library, CallingConvention=CallingConvention.Cdecl)] static extern int hwe_js_layout_v1(out Layout layout);
        [DllImport(Library, CallingConvention=CallingConvention.Cdecl)] static extern int hwe_js_create_v1(ref Options options, byte* code, ulong codeSize, byte* data, ulong dataSize, out IntPtr host);
        [DllImport(Library, CallingConvention=CallingConvention.Cdecl)] static extern int hwe_js_submit_v1(IntPtr host, byte* request, ulong length, out ulong responseLength);
        [DllImport(Library, CallingConvention=CallingConvention.Cdecl)] static extern int hwe_js_copy_response_v1(IntPtr host, byte* buffer, ulong capacity, out ulong written);
        [DllImport(Library, CallingConvention=CallingConvention.Cdecl)] static extern int hwe_js_release_response_v1(IntPtr host);
        [DllImport(Library, CallingConvention=CallingConvention.Cdecl)] static extern int hwe_js_metrics_v1(IntPtr host, out Metrics metrics);
        [DllImport(Library, CallingConvention=CallingConvention.Cdecl)] static extern int hwe_js_collect_v1(IntPtr host, out Metrics metrics);
        [DllImport(Library, CallingConvention=CallingConvention.Cdecl)] static extern int hwe_js_destroy_v1(ref IntPtr host, out Metrics metrics);

        public Metrics FinalMetrics { get; private set; }
        public bool IsClosed { get { lock (gate) return handle == IntPtr.Zero; } }
        public static GameplayHost OpenCombat() => Open("Combat", PackHashes.CombatRules, PackHashes.CombatContent, 64);
        public static GameplayHost OpenMemoryPouches() => Open("Pouches", PackHashes.PouchRules, PackHashes.PouchContent, 12);
        public static GameplayHost OpenWorkshop() => Open("Workshop", PackHashes.WorkshopRules, PackHashes.WorkshopContent, 32);
        public static GameplayHost OpenProgression() => Open("Progression", PackHashes.ProgressionRules, PackHashes.ProgressionContent, 32);
        internal static string WorkshopInspection() => Utf8.GetString(Read("WorkshopInspection", PackHashes.WorkshopInspection));
        internal static string WorkshopEquipment() => Utf8.GetString(Read("WorkshopEquipment", PackHashes.WorkshopEquipment));
        internal static byte[] Read(string asset, string expected)
        {
            var source = Resources.Load<TextAsset>("HollowWake/" + asset);
            if (source == null) throw new InvalidOperationException("Missing Hollow Wake asset " + asset);
            var bytes = source.bytes;
            using (var hash = SHA256.Create())
                if (!String.Equals(BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", ""), expected, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Mismatched Hollow Wake asset " + asset);
            return bytes;
        }
        static GameplayHost Open(string prefix, string rulesHash, string contentHash, uint heapMiB)
        {
            RequirePlatform();
            return Create(Read(prefix + "Rules", rulesHash), Read(prefix + "Content", contentHash), heapMiB);
        }
        static void RequirePlatform()
        {
            if ((Application.platform != RuntimePlatform.WindowsEditor && Application.platform != RuntimePlatform.WindowsPlayer) || IntPtr.Size != 8)
                throw new PlatformNotSupportedException("This Hollow Wake package supplies the Windows x64 runtime.");
        }
        /// <summary>Creates an owner from a trusted, compiled SDK capability and
        /// its validated content. Call on the Unity main thread. Optional startup
        /// collection requires the 0.4.1 native runtime or later; it has no
        /// frame-time bound. The heap cap excludes Unity and managed memory.</summary>
        public static GameplayHost Create(byte[] rules, byte[] content, uint heapMiB, bool collectAfterCreate=false)
        {
            RequirePlatform();
            if(rules==null)throw new ArgumentNullException(nameof(rules));
            if(content==null)throw new ArgumentNullException(nameof(content));
            if(heapMiB<1 || heapMiB>1024)throw new ArgumentOutOfRangeException(nameof(heapMiB));
            return new GameplayHost(rules,content,heapMiB,collectAfterCreate);
        }
        GameplayHost(byte[] rules, byte[] content, uint heapMiB, bool collectAfterCreate)
        {
            Check(hwe_js_layout_v1(out var layout));
            if (layout.abi != Abi || layout.pointer != IntPtr.Size || layout.options != sizeof(Options) || layout.metrics != sizeof(Metrics))
                throw new InvalidOperationException("Incompatible Hollow Wake native library");
            var options = new Options { abi = Abi, heap = (ulong)heapMiB << 20, request = RequestLimit, response = ResponseLimit, polls = 1000000 };
            fixed (byte* code = rules, data = content)
                Check(hwe_js_create_v1(ref options, code, (ulong)rules.Length, data, (ulong)content.Length, out handle));
            try
            {
                if(collectAfterCreate)Check(hwe_js_collect_v1(handle,out var collected));
                lock (Live) Live.Add(this);
            }
            catch { Dispose();throw; }
        }
        static void Check(int status)
        {
            if (status != 0) throw new InvalidOperationException("Hollow Wake native operation failed (" + status + ")");
        }
        static void Ensure(ref byte[] buffer, int needed, int limit)
        {
            if (needed > limit) throw new ArgumentOutOfRangeException(nameof(needed));
            if (buffer.Length < needed) buffer = new byte[Math.Min(limit, Math.Max(buffer.Length * 2, needed))];
        }
        public string Execute(string requestJson)
        {
            if (requestJson == null) throw new ArgumentNullException(nameof(requestJson));
            lock (gate)
            {
                if (handle == IntPtr.Zero) throw new ObjectDisposedException(nameof(GameplayHost));
                int length = Utf8.GetByteCount(requestJson);
                Ensure(ref inputBuffer, length, RequestLimit);
                Utf8.GetBytes(requestJson, 0, requestJson.Length, inputBuffer, 0);
                ulong responseLength;
                fixed (byte* request = inputBuffer) Check(hwe_js_submit_v1(handle, request, (ulong)length, out responseLength));
                try
                {
                    Ensure(ref outputBuffer, checked((int)responseLength), ResponseLimit);
                    ulong written;
                    fixed (byte* response = outputBuffer)
                        Check(hwe_js_copy_response_v1(handle, response, (ulong)outputBuffer.Length, out written));
                    if (written != responseLength) throw new InvalidOperationException("Unexpected SDK response length");
                    traffic.Requests++;
                    traffic.RequestBytes += (ulong)length;
                    traffic.ResponseBytes += written;
                    return Utf8.GetString(outputBuffer, 0, (int)written);
                }
                finally { Check(hwe_js_release_response_v1(handle)); }
            }
        }
        public Metrics ReadMetrics()
        {
            lock (gate)
            {
                if (handle == IntPtr.Zero) return FinalMetrics;
                Check(hwe_js_metrics_v1(handle, out var result));
                return result;
            }
        }
        public Traffic ReadTraffic() { lock (gate) return traffic; }
        /// <summary>Explicit idle-boundary collection. Never call per frame;
        /// this synchronous native pass has no wall-time bound.</summary>
        public Metrics Collect()
        {
            lock(gate)
            {
                if(handle==IntPtr.Zero)throw new ObjectDisposedException(nameof(GameplayHost));
                Check(hwe_js_collect_v1(handle,out var result));return result;
            }
        }
        public void Dispose()
        {
            lock (gate)
            {
                if (handle == IntPtr.Zero) return;
                int status = hwe_js_destroy_v1(ref handle, out var final);
                FinalMetrics = final;
                if (handle == IntPtr.Zero)
                {
                    lock (Live) Live.Remove(this);
                    inputBuffer = outputBuffer = Array.Empty<byte>();
                }
                Check(status);
            }
        }
        static void CloseAll()
        {
            GameplayHost[] hosts;
            lock (Live) { hosts = new GameplayHost[Live.Count]; Live.CopyTo(hosts); }
            foreach (var host in hosts)
                try { host.Dispose(); } catch (Exception error) { Debug.LogException(error); }
        }
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void OnStart()
        {
            Application.quitting -= CloseAll;
            Application.quitting += CloseAll;
        }
#if UNITY_EDITOR
        [UnityEditor.InitializeOnLoadMethod]
        static void RegisterReload()
        {
            UnityEditor.AssemblyReloadEvents.beforeAssemblyReload += CloseAll;
            UnityEditor.EditorApplication.quitting += CloseAll;
            UnityEditor.EditorApplication.playModeStateChanged += state => {
                if (state == UnityEditor.PlayModeStateChange.ExitingPlayMode) CloseAll();
            };
        }
#endif
    }
}
