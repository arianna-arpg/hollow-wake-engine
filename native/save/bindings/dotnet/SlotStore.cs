using System;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace HollowWake.Storage
{
    public enum SaveStatus
    {
        Ok=0, Pending=1, Unavailable=2, Busy=3, Storage=4, InvalidPath=5,
        InvalidJournal=6, JournalUnavailable=7, IncompatibleDatabase=8,
        InvalidRecord=9, InvalidRevisionOrSlot=10, PayloadSize=11, StaleRevision=12,
        InvalidToken=13, InvalidTicket=14, Cancelled=15, TooLate=16,
        WorkerUnavailable=17, InvalidArgument=18, InvalidUtf8=19, AbiMismatch=20,
        OutOfMemory=21, Internal=22
    }
    public enum SaveJournal { Preserve=0, Wal=1, Rollback=2, Other=3 }
    public readonly struct SaveResult
    {
        public readonly SaveStatus Status;
        public readonly int SqliteCode;
        // Operation-specific: revision, transaction token, ticket or journal.
        public readonly ulong Value;
        public bool Succeeded => Status==SaveStatus.Ok;
        internal SaveResult(int status,int code,ulong value) { Status=(SaveStatus)status;SqliteCode=code;Value=value; }
    }
    public readonly struct SaveRecord
    {
        public readonly SaveResult Result;
        public readonly string CraftingJson, StashJson;
        public ulong Revision => Result.Value;
        public bool IsEmpty => Result.Succeeded && Revision==0;
        internal SaveRecord(SaveResult result,string crafting,string stash) { Result=result;CraftingJson=crafting;StashJson=stash; }
    }
    public readonly struct SaveCheckpoint
    {
        public readonly SaveResult Result;
        public readonly int Frames, Copied;
        public bool Complete => Result.Succeeded && Result.Value!=0;
        internal SaveCheckpoint(SaveResult result,int frames,int copied) { Result=result;Frames=frames;Copied=copied; }
    }

    /// <summary>Optional local save storage. Dispose on the owning host's normal
    /// shutdown after consuming any pending completion. Gameplay validation and
    /// publishing changes after a successful commit remain with the caller.</summary>
    public sealed unsafe class SlotStore : IDisposable
    {
        public const int DocumentLimit=512*1024, PathLimit=128*1024;
        public const ulong MaximumRevision=9007199254740991UL;
        const string Library="hwe_save";
        static readonly UTF8Encoding Utf8=new UTF8Encoding(false,true);
        readonly object gate=new object();
        readonly NativeHandle handle;
        byte[] bodyBuffer=new byte[256], stashBuffer=new byte[256];
        ulong pendingTicket;
        [StructLayout(LayoutKind.Sequential)]
        struct NativeResult
        {
            public int status, code;
            public ulong value;
            public SaveResult Public => new SaveResult(status,code,value);
        }
        [StructLayout(LayoutKind.Sequential)]
        struct NativeView { public IntPtr crafting;public uint craftingLength;public IntPtr stash;public uint stashLength; }
        sealed class NativeHandle : SafeHandleZeroOrMinusOneIsInvalid
        {
            internal NativeHandle() : base(true) {}
            internal void Own(IntPtr value) { SetHandle(value); }
            protected override bool ReleaseHandle() { Native.Destroy(handle);return true; }
        }
        static class Native
        {
            [DllImport(Library,EntryPoint="hwe_save_abi_version",CallingConvention=CallingConvention.Cdecl)] internal static extern uint Abi();
            [DllImport(Library,EntryPoint="hwe_save_view_size",CallingConvention=CallingConvention.Cdecl)] internal static extern uint ViewSize();
            [DllImport(Library,EntryPoint="hwe_save_create",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult Create(uint abi,out IntPtr handle);
            [DllImport(Library,EntryPoint="hwe_save_destroy",CallingConvention=CallingConvention.Cdecl)] internal static extern void Destroy(IntPtr handle);
            [DllImport(Library,EntryPoint="hwe_save_open",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult Open(NativeHandle handle,byte* path,uint length,int journal);
            [DllImport(Library,EntryPoint="hwe_save_close",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult Close(NativeHandle handle);
            [DllImport(Library,EntryPoint="hwe_save_read",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult Read(NativeHandle handle,uint slot,out NativeView view);
            [DllImport(Library,EntryPoint="hwe_save_stage",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult Stage(NativeHandle handle,uint slot,ulong revision,byte* body,uint size,byte* stash,uint stashSize);
            [DllImport(Library,EntryPoint="hwe_save_submit",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult Submit(NativeHandle handle,uint slot,ulong revision,byte* body,uint size,byte* stash,uint stashSize);
            [DllImport(Library,EntryPoint="hwe_save_commit",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult Commit(NativeHandle handle,ulong token);
            [DllImport(Library,EntryPoint="hwe_save_cancel",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult Cancel(NativeHandle handle,ulong token);
            [DllImport(Library,EntryPoint="hwe_save_poll",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult Poll(NativeHandle handle,ulong ticket);
            [DllImport(Library,EntryPoint="hwe_save_cancel_async",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult CancelAsync(NativeHandle handle,ulong ticket);
            [DllImport(Library,EntryPoint="hwe_save_checkpoint",CallingConvention=CallingConvention.Cdecl)] internal static extern NativeResult Checkpoint(NativeHandle handle,out int frames,out int copied);
        }
        public SlotStore()
        {
            if(Native.Abi()!=1 || Native.ViewSize()!=Marshal.SizeOf<NativeView>() || sizeof(NativeResult)!=16)
                throw new InvalidOperationException("Incompatible Hollow Wake save library.");
            handle=new NativeHandle();
            var created=Native.Create(1,out var pointer);
            handle.Own(pointer);
            if(created.status!=0) { handle.Dispose();throw new InvalidOperationException("Could not create save store: "+created.Public.Status); }
        }
        public bool IsDisposed { get { lock(gate)return handle.IsClosed; } }
        public bool IsSaving { get { lock(gate)return pendingTicket!=0; } }
        void Check() { if(handle.IsClosed)throw new ObjectDisposedException(nameof(SlotStore)); }
        static SaveStatus Encode(string value,ref byte[] buffer,int limit,out int length)
        {
            if(value==null)throw new ArgumentNullException(nameof(value));
            length=0;
            if(value.Length==0 || value.Length>limit)return SaveStatus.PayloadSize;
            try { length=Utf8.GetByteCount(value); }
            catch(EncoderFallbackException) { return SaveStatus.InvalidUtf8; }
            if(length>limit)return SaveStatus.PayloadSize;
            if(buffer.Length<length)buffer=new byte[Math.Min(limit,Math.Max(buffer.Length*2,length))];
            Utf8.GetBytes(value,0,value.Length,buffer,0);
            return SaveStatus.Ok;
        }
        static SaveResult Refused(SaveStatus status) => new SaveResult((int)status,0,0);
        public SaveResult Open(string absolutePath,SaveJournal journal=SaveJournal.Wal)
        {
            lock(gate)
            {
                Check();
                var encoding=Encode(absolutePath,ref bodyBuffer,PathLimit,out var size);
                if(encoding!=SaveStatus.Ok)return Refused(encoding==SaveStatus.PayloadSize?SaveStatus.InvalidPath:encoding);
                fixed(byte* path=bodyBuffer)return Native.Open(handle,path,(uint)size,(int)journal).Public;
            }
        }
        static string Decode(IntPtr data,uint length)
        {
            if(length>DocumentLimit || (length!=0 && data==IntPtr.Zero))throw new InvalidOperationException("Invalid native save view.");
            return length==0 ? "" : Utf8.GetString((byte*)data,checked((int)length));
        }
        public SaveRecord Read(uint slot)
        {
            lock(gate)
            {
                Check();
                var result=Native.Read(handle,slot,out var view).Public;
                return result.Succeeded ? new SaveRecord(result,Decode(view.crafting,view.craftingLength),Decode(view.stash,view.stashLength))
                    : new SaveRecord(result,null,null);
            }
        }
        SaveResult Write(uint slot,ulong revision,string craftingJson,string stashJson,bool async)
        {
            lock(gate)
            {
                Check();
                if(slot>65535 || revision>=MaximumRevision)return Refused(SaveStatus.InvalidRevisionOrSlot);
                if(pendingTicket!=0)return Refused(SaveStatus.Unavailable);
                var encoding=Encode(craftingJson,ref bodyBuffer,DocumentLimit,out var size);
                if(encoding!=SaveStatus.Ok)return Refused(encoding);
                encoding=Encode(stashJson,ref stashBuffer,DocumentLimit,out var stashSize);
                if(encoding!=SaveStatus.Ok)return Refused(encoding);
                fixed(byte* body=bodyBuffer,stash=stashBuffer)
                {
                    var result=(async ? Native.Submit(handle,slot,revision,body,(uint)size,stash,(uint)stashSize)
                        : Native.Stage(handle,slot,revision,body,(uint)size,stash,(uint)stashSize)).Public;
                    if(async && result.Succeeded)pendingTicket=result.Value;
                    return result;
                }
            }
        }
        public SaveResult Stage(uint slot,ulong revision,string craftingJson,string stashJson) => Write(slot,revision,craftingJson,stashJson,false);
        public SaveResult Submit(uint slot,ulong revision,string craftingJson,string stashJson) => Write(slot,revision,craftingJson,stashJson,true);
        public SaveResult Commit(ulong token) { lock(gate) { Check();return Native.Commit(handle,token).Public; } }
        public SaveResult Cancel(ulong token) { lock(gate) { Check();return Native.Cancel(handle,token).Public; } }
        public SaveResult CancelAsync(ulong ticket) { lock(gate) { Check();return Native.CancelAsync(handle,ticket).Public; } }
        public SaveResult Poll(ulong ticket)
        {
            lock(gate)
            {
                Check();
                var result=Native.Poll(handle,ticket).Public;
                if(ticket==pendingTicket && result.Status!=SaveStatus.Pending && result.Status!=SaveStatus.InvalidTicket)pendingTicket=0;
                return result;
            }
        }
        public SaveCheckpoint Checkpoint()
        {
            lock(gate) { Check();return new SaveCheckpoint(Native.Checkpoint(handle,out var frames,out var copied).Public,frames,copied); }
        }
        /// <summary>Closes the database and joins admitted work; the instance can
        /// reopen. Dispose permanently releases it. Poll before normal departure.</summary>
        public SaveResult Close()
        {
            lock(gate)
            {
                Check();
                var result=Native.Close(handle).Public;
                if(result.Succeeded)pendingTicket=0;
                return result;
            }
        }
        public void Dispose()
        {
            lock(gate) { handle.Dispose();pendingTicket=0;bodyBuffer=stashBuffer=Array.Empty<byte>(); }
        }
    }
}
