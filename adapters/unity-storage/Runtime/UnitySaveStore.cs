using System;
using System.Collections.Generic;
using UnityEngine;

[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("HollowWake.Storage.Gameplay")]

namespace HollowWake.Storage
{
    /// <summary>Unity lifetime ownership for one optional local save store.
    /// Create on the main thread and dispose when its owning service ends.
    /// The host chooses the path and publishes gameplay only after commit.</summary>
    public sealed class UnitySaveStore : IDisposable
    {
        static readonly HashSet<UnitySaveStore> Live = new HashSet<UnitySaveStore>();
        public SlotStore Store { get; }
        public bool IsDisposed => Store.IsDisposed;
        // Optional bridge ownership, without a gameplay dependency here. The
        // callback runs on the caller's main thread, never on the save worker.
        internal Action Closed;

        public UnitySaveStore()
        {
            if ((Application.platform != RuntimePlatform.WindowsEditor &&
                 Application.platform != RuntimePlatform.WindowsPlayer) || IntPtr.Size != 8)
                throw new PlatformNotSupportedException("This storage package supplies the Windows x64 native library.");
            Store = new SlotStore();
            try { lock (Live) Live.Add(this); }
            catch { Store.Dispose(); throw; }
        }
        public void Dispose()
        {
            try { Store.Dispose(); }
            finally
            {
                if(Store.IsDisposed)
                {
                    lock (Live) Live.Remove(this);
                    var notify=Closed;Closed=null;
                    notify?.Invoke();
                }
            }
        }
        static void CloseAll()
        {
            // Drain without allocating a snapshot during shutdown or reload.
            for (;;)
            {
                UnitySaveStore store;
                lock (Live)
                {
                    if (Live.Count == 0) return;
                    var iterator = Live.GetEnumerator();
                    iterator.MoveNext(); store = iterator.Current; iterator.Dispose();
                    Live.Remove(store);
                }
                try { store.Dispose(); } catch (Exception error) { Debug.LogException(error); }
            }
        }
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void OnStart()
        {
            CloseAll();
            Application.quitting -= CloseAll;
            Application.quitting += CloseAll;
        }
#if UNITY_EDITOR
        [UnityEditor.InitializeOnLoadMethod]
        static void RegisterEditor()
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
