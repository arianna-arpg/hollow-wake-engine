#if HWE_STORAGE_SHARED_ACCOUNT
using System;
using System.Collections.Generic;
using System.IO;
using HollowWake.Gameplay;

namespace HollowWake.Storage
{
    public readonly struct SharedAccountAction
    {
        // -1 addresses the account; 0..6 address configured inventories.
        public readonly int Inventory;
        public readonly string Json;
        public SharedAccountAction(int inventory,string json){Inventory=inventory;Json=json??throw new ArgumentNullException(nameof(json));}
    }
    public readonly struct SharedInventoryStart
    {
        public readonly uint Seed;
        public readonly string StateJson,ExtraJson;
        public readonly bool Progression;
        public readonly long NextUid;
        public SharedInventoryStart(uint seed,string stateJson,string extraJson="{}",bool progression=true,long nextUid=0)
        { Seed=seed;StateJson=stateJson;ExtraJson=extraJson;Progression=progression;NextUid=nextUid; }
    }
    public sealed class SharedSavedRecord
    {
        public readonly uint Slot;
        public readonly ulong Revision;
        public readonly string Json,ExtraJson;
        internal SharedSavedRecord(uint slot,ulong revision,string json,string extra)
        { Slot=slot;Revision=revision;Json=json;ExtraJson=extra; }
    }
    public sealed class SharedAccountSnapshot
    {
        public readonly SharedSavedRecord Account;
        public IReadOnlyList<SharedSavedRecord> Inventories { get; }
        internal SharedAccountSnapshot(SharedSavedRecord[] records)
        { Account=records[0];var rows=new SharedSavedRecord[records.Length-1];Array.Copy(records,1,rows,0,rows.Length);Inventories=Array.AsReadOnly(rows); }
        internal SharedSavedRecord At(int index)=>index==0?Account:Inventories[index-1];
    }
    public readonly struct SharedAccountChange
    {
        public readonly WorkshopChangeState State;
        public readonly string RepliesJson,Reason;
        public readonly SaveStatus? StorageStatus;
        public readonly int SqliteCode;
        internal SharedAccountChange(WorkshopChangeState state,string replies=null,string reason=null,SaveStatus? status=null,int code=0)
        { State=state;RepliesJson=replies;Reason=reason;StorageStatus=status;SqliteCode=code; }
    }

    /// <summary>Main-thread owner of one fixed durable aggregate: one account
    /// and 1–7 inventories. Every commit checks and writes the whole group,
    /// including unchanged dependencies. The host authorizes commands and
    /// decides whether provisional gameplay results are acceptable. Reopen this
    /// owner after a stale write; legacy competing accounts are never merged.</summary>
    public sealed class DurableSharedAccount : IDisposable
    {
        readonly UnitySaveStore storage;
        readonly SharedAccountWorkshop owner;
        readonly uint[] slots;
        readonly SharedAccountWorkshop.Inventory[] inventories;
        SharedAccountWorkshop.Account account;
        SharedAccountWorkshop.PreparedChange pending;
        SharedAccountSnapshot pendingView;
        string pendingReplies;
        ulong ticket;
        bool closed,evaluating;
        public SharedAccountSnapshot Current { get; private set; }
        public bool IsBusy=>ticket!=0||evaluating;
        public bool IsDisposed=>closed||storage.IsDisposed||owner.IsDisposed;
        public bool IsReady=>Current!=null&&!IsDisposed;

        public DurableSharedAccount(string absolutePath,uint accountSlot,params uint[] inventorySlots)
        {
            if(inventorySlots==null||inventorySlots.Length<1||inventorySlots.Length>7)throw new ArgumentOutOfRangeException(nameof(inventorySlots));
            slots=new uint[inventorySlots.Length+1];slots[0]=accountSlot;Array.Copy(inventorySlots,0,slots,1,inventorySlots.Length);
            var distinct=new HashSet<uint>();foreach(var slot in slots)if(slot>65535||!distinct.Add(slot))throw new ArgumentException("Reserve distinct save slots in 0–65535.");
            inventories=new SharedAccountWorkshop.Inventory[inventorySlots.Length];storage=new UnitySaveStore();
            try
            {
                if(!storage.Store.SupportsGroupedSaves)throw new NotSupportedException("Grouped save storage is required.");
                var opened=storage.Store.Open(absolutePath);if(!opened.Succeeded)throw new IOException("Shared account storage refused: "+opened.Status);
                var group=storage.Store.ReadGroup(slots);if(!group.Result.Succeeded)throw new IOException("Shared account group refused: "+group.Result.Status);
                bool empty=group.Records[0].IsEmpty;foreach(var record in group.Records)if(record.IsEmpty!=empty)throw new IOException("Incomplete shared account group.");
                owner=SharedAccountWorkshop.Open();
                if(!empty)
                {
                    account=owner.RestoreAccount(1,group.Records[0].CraftingJson);
                    var records=new SharedSavedRecord[slots.Length];records[0]=new SharedSavedRecord(slots[0],group.Records[0].Revision,account.Save().Json,group.Records[0].StashJson);
                    for(int i=0;i<inventories.Length;i++)
                    {
                        inventories[i]=account.RestoreInventory((uint)i+1,group.Records[i+1].CraftingJson);
                        records[i+1]=new SharedSavedRecord(slots[i+1],group.Records[i+1].Revision,inventories[i].Save().Json,group.Records[i+1].StashJson);
                    }
                    Current=new SharedAccountSnapshot(records);
                }
                storage.Closed=Dispose;
            }
            catch { Dispose();throw; }
        }
        void Check(){if(IsDisposed)throw new ObjectDisposedException(nameof(DurableSharedAccount));}
        static SharedAccountChange Refused(string reason)=>new SharedAccountChange(WorkshopChangeState.Refused,reason:reason);
        static SharedAccountChange StorageRefused(SaveResult result)=>new SharedAccountChange(WorkshopChangeState.Refused,reason:result.Status.ToString(),status:result.Status,code:result.SqliteCode);
        static SharedAccountChange Waiting()=>new SharedAccountChange(WorkshopChangeState.Pending,status:SaveStatus.Pending);
        void Discard()
        {
            try { pending?.Dispose(); }
            finally
            {
                pending=null;pendingView=null;pendingReplies=null;ticket=0;
                if(Current==null)
                {
                    for(int i=inventories.Length-1;i>=0;i--){inventories[i]?.Dispose();inventories[i]=null;}
                    account?.Dispose();account=null;
                }
            }
        }
        SharedAccountChange Queue(string[] bodies,string[] extras)
        {
            var writes=new SaveWrite[slots.Length];var records=new SharedSavedRecord[slots.Length];
            for(int i=0;i<slots.Length;i++)
            {
                ulong revision=Current?.At(i).Revision??0;
                if(revision>=SlotStore.MaximumRevision){Discard();return Refused("revision-exhausted");}
                // Never omit an unchanged account/inventory from this compare-and-swap.
                writes[i]=new SaveWrite(slots[i],revision,bodies[i],extras[i]);
                records[i]=new SharedSavedRecord(slots[i],revision+1,bodies[i],extras[i]);
            }
            pendingView=new SharedAccountSnapshot(records);
            var result=storage.Store.SubmitGroup(writes);
            if(!result.Succeeded){Discard();return StorageRefused(result);}
            ticket=result.Value;return Waiting();
        }
        public SharedAccountChange BeginCreate(string key,uint seed,string fieldsJson,SharedInventoryStart[] starts,string accountExtraJson="{}")
        {
            Check();if(IsBusy)return Refused("save-pending");if(Current!=null)return Refused("already-initialized");
            if(starts==null||starts.Length!=inventories.Length)throw new ArgumentException("Supply every configured inventory.",nameof(starts));
            if(accountExtraJson==null)throw new ArgumentNullException(nameof(accountExtraJson));
            evaluating=true;
            try
            {
                account=owner.OpenAccount(1,key,seed,fieldsJson);var bodies=new string[slots.Length];var extras=new string[slots.Length];
                bodies[0]=account.Save().Json;extras[0]=accountExtraJson;
                for(int i=0;i<inventories.Length;i++)
                {
                    if(starts[i].ExtraJson==null)throw new ArgumentNullException(nameof(starts));
                    inventories[i]=account.OpenInventory((uint)i+1,starts[i].Seed,starts[i].StateJson,starts[i].Progression,starts[i].NextUid);
                    bodies[i+1]=inventories[i].Save().Json;extras[i+1]=starts[i].ExtraJson;
                }
                return Queue(bodies,extras);
            }
            catch { try{Discard();}finally{if(owner.IsDisposed)Dispose();}throw; }
            finally { evaluating=false; }
        }
        /// <summary>Policy receives complete provisional replies; no cue is
        /// published by this method. Rejecting or throwing aborts the proposal.
        /// Check nested gameplay results, including refused account purchases.</summary>
        public SharedAccountChange Submit(SharedAccountAction[] actions,Func<string,bool> accept)
        {
            Check();if(IsBusy)return Refused("save-pending");if(Current==null)return Refused("not-initialized");
            if(actions==null||actions.Length<1||actions.Length>16)throw new ArgumentOutOfRangeException(nameof(actions));
            if(accept==null)throw new ArgumentNullException(nameof(accept));
            evaluating=true;
            try
            {
                var commands=new SharedAccountWorkshop.Command[actions.Length];
                for(int i=0;i<actions.Length;i++)
                {
                    var action=actions[i];if(action.Inventory < -1||action.Inventory>=inventories.Length)throw new ArgumentOutOfRangeException(nameof(actions));
                    commands[i]=action.Inventory==-1?account.Command(action.Json):inventories[action.Inventory].Command(action.Json);
                }
                try { pending=owner.Prepare(commands); }
                catch(InvalidOperationException error){if(owner.IsDisposed)throw;return Refused(error.Message);}
                if(!accept(pending.RepliesJson)){Discard();return Refused("gameplay-policy-refused");}
                Check();pendingReplies=pending.RepliesJson;
                if(!pending.HasChanges)
                {
                    var reply=pendingReplies;pending.Commit();Discard();return new SharedAccountChange(WorkshopChangeState.Unchanged,reply);
                }
                var bodies=new string[slots.Length];var extras=new string[slots.Length];
                for(int i=0;i<slots.Length;i++){bodies[i]=Current.At(i).Json;extras[i]=Current.At(i).ExtraJson;}
                for(int i=0;i<pending.Writes.Count;i++)
                {
                    var write=pending.Writes[i];int index=write.Kind=="account"?0:checked((int)write.Handle);
                    if(index<0||index>=slots.Length||(index==0&&write.Handle!=1))throw new InvalidOperationException("Prepared record outside reserved group.");
                    bodies[index]=pending.Save(i).Json;
                }
                return Queue(bodies,extras);
            }
            catch { try{Discard();}finally{if(owner.IsDisposed)Dispose();}throw; }
            finally { evaluating=false; }
        }
        public SharedAccountChange Poll()
        {
            // Settle the durable result even if Unity already retired the
            // gameplay runtime. A committed write then takes the failure-close
            // path below instead of being mistaken for an aborted transaction.
            if(closed||storage.IsDisposed)throw new ObjectDisposedException(nameof(DurableSharedAccount));
            if(evaluating)return Refused("save-pending");if(ticket==0){Check();return Refused("no-pending-save");}
            var result=storage.Store.Poll(ticket);if(result.Status==SaveStatus.Pending)return Waiting();
            if(!result.Succeeded){try{Discard();}finally{if(owner.IsDisposed)Dispose();}return StorageRefused(result);}
            try
            {
                pending?.Commit();Current=pendingView;
                var reply=new SharedAccountChange(WorkshopChangeState.Committed,pendingReplies,status:SaveStatus.Ok);
                Discard();return reply;
            }
            catch(Exception error)
            {
                try{Dispose();}catch(Exception closing){error=new AggregateException(error,closing);}
                throw new IOException("Shared account save committed but publication failed. Reopen the entire saved group.",error);
            }
        }
        public SaveResult CancelPending()
        { Check();if(ticket==0)throw new InvalidOperationException("No pending save.");return storage.Store.CancelAsync(ticket); }
        public GameplayHost.Metrics ReadMetrics()=>owner.ReadMetrics();
        public void Dispose()
        {
            if(closed)return;closed=true;
            try { storage?.Dispose(); }
            finally
            {
                try { owner?.Dispose(); }
                finally { pending=null;pendingView=null;pendingReplies=null;ticket=0;account=null;Array.Clear(inventories,0,inventories.Length); }
            }
        }
    }
}
#endif
