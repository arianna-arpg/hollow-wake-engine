#if HWE_STORAGE_ACCOUNT
using System;
using System.IO;
using HollowWake.Gameplay;
using UnityEngine;

namespace HollowWake.Storage
{
    /// <summary>One immutable, committed account/inventory view. Retain this
    /// object when a screen needs both owners from the same publication.</summary>
    public sealed class AccountWorkshopSnapshot
    {
        public readonly string AccountJson, WorkshopJson, AccountExtraJson, StashJson;
        public readonly ulong AccountRevision, WorkshopRevision;
        internal AccountWorkshopSnapshot(string account,string workshop,string extra,string stash,ulong accountRevision,ulong workshopRevision)
        { AccountJson=account;WorkshopJson=workshop;AccountExtraJson=extra;StashJson=stash;AccountRevision=accountRevision;WorkshopRevision=workshopRevision; }
    }
    public readonly struct AccountWorkshopChange
    {
        public readonly WorkshopChangeState State;
        public readonly string AccountReplyJson, WorkshopReplyJson, Reason;
        public readonly SaveStatus? StorageStatus;
        public readonly int SqliteCode;
        public bool Succeeded => State==WorkshopChangeState.Committed || State==WorkshopChangeState.Unchanged || State==WorkshopChangeState.Reloaded;
        internal AccountWorkshopChange(WorkshopChangeState state,string account,string workshop,string reason,SaveStatus? status=null,int code=0)
        { State=state;AccountReplyJson=account;WorkshopReplyJson=workshop;Reason=reason;StorageStatus=status;SqliteCode=code; }
    }

    /// <summary>One main-thread owner for two distinct durable records.
    /// Commands run on private account/workshop candidates. Invalid commands,
    /// false progression results, stale writes and cancellation discard both
    /// candidates; only a successful
    /// commit publishes a new immutable Current view. The host authorizes the
    /// commands and owns both auxiliary documents and the reserved slot mapping.
    /// Workshop ok=true replies retain original event/no-op/RNG semantics; they
    /// do not guarantee a successful purchase or item change. This owner does not
    /// merge progression fields with the workshop's account/lore projection.</summary>
    public sealed class DurableAccountWorkshop : IDisposable
    {
        readonly UnitySaveStore storage;
        readonly AccountProgression progression;
        readonly CraftingWorkshop workshop;
        readonly uint accountSlot, workshopSlot;
        AccountProgression.Profile account, nextAccount;
        CraftingWorkshop.Profile inventory, nextInventory;
        uint currentId, nextId;
        ulong ticket;
        AccountWorkshopSnapshot pendingView;
        string accountReply, workshopReply;
        bool closed;
        CombatWorld.Actor actor;
        CombatWorld.Actor.PreparedEquipment equipment;
        string currentEquipment, nextEquipment;
        [Serializable] class Envelope { public bool ok;public string reason; }
        [Serializable] class AccountEnvelope : Envelope { public bool result; }

        public AccountWorkshopSnapshot Current { get; private set; }
        public bool IsReady => Current!=null && !IsDisposed;
        public bool IsBusy => ticket!=0;
        public bool IsDisposed => closed || storage.IsDisposed;

        public DurableAccountWorkshop(string absolutePath,uint accountSlot,uint workshopSlot)
        {
            if(accountSlot>65535 || workshopSlot>65535 || accountSlot==workshopSlot)
                throw new ArgumentOutOfRangeException(nameof(workshopSlot),"Choose two distinct save slots.");
            this.accountSlot=accountSlot;this.workshopSlot=workshopSlot;
            storage=new UnitySaveStore();
            try
            {
                if(!storage.Store.SupportsGroupedSaves)throw new NotSupportedException("Grouped save storage is required.");
                var opened=storage.Store.Open(absolutePath);
                if(!opened.Succeeded)throw new IOException("Account/workshop storage refused: "+opened.Status);
                var group=storage.Store.ReadGroup(accountSlot,workshopSlot);
                if(!group.Result.Succeeded)throw new IOException("Account/workshop read refused: "+group.Result.Status);
                if(group.Records[0].IsEmpty!=group.Records[1].IsEmpty)
                    throw new IOException("Incomplete account/workshop group. Both records must be initialized together.");
                progression=new AccountProgression();workshop=new CraftingWorkshop();
                if(!group.Records[0].IsEmpty)
                {
                    account=progression.RestoreProfile(1,group.Records[0].CraftingJson);
                    inventory=workshop.RestoreProfile(1,group.Records[1].CraftingJson);
                    Current=new AccountWorkshopSnapshot(account.Save(),inventory.Save(),group.Records[0].StashJson,
                        group.Records[1].StashJson,group.Records[0].Revision,group.Records[1].Revision);
                    currentId=1;
                }
                storage.Closed=Dispose;
            }
            catch { Dispose();throw; }
        }
        /// <summary>Transfers actor lifetime to this owner. Equipment is prepared
        /// privately and published at the same main-thread boundary as Current.
        /// Dispose the combat world after this owner.</summary>
        public DurableAccountWorkshop(string absolutePath,uint accountSlot,uint workshopSlot,CombatWorld.Actor actor)
            : this(absolutePath,accountSlot,workshopSlot)
        {
            try
            {
                this.actor=actor??throw new ArgumentNullException(nameof(actor));
                if(inventory!=null)
                {
                    currentEquipment=inventory.EquipmentJson();
                    using(var initial=actor.PrepareEquipment(currentEquipment))initial.Publish();
                }
            }
            catch { Dispose();throw; }
        }
        void Check()
        {
            if(IsDisposed)throw new ObjectDisposedException(nameof(DurableAccountWorkshop));
            if(actor!=null && actor.IsDisposed) { Dispose();throw new ObjectDisposedException(nameof(CombatWorld.Actor)); }
        }
        static AccountWorkshopChange Refused(string reason,string account=null,string workshop=null) =>
            new AccountWorkshopChange(WorkshopChangeState.Refused,account,workshop,reason);
        static AccountWorkshopChange StorageRefused(SaveResult result) =>
            new AccountWorkshopChange(WorkshopChangeState.Refused,null,null,result.Status.ToString(),result.Status,result.SqliteCode);
        static AccountWorkshopChange Pending() =>
            new AccountWorkshopChange(WorkshopChangeState.Pending,null,null,null,SaveStatus.Pending);
        static bool Accepted(string reply,bool accountCommand,out string reason)
        {
            // Progression purchases can return ok=true,result=false. Other
            // progression replies omit result; overwrite preserves its true
            // initializer. Never infer success from the caller's JSON op field.
            if(accountCommand)
            {
                var envelope=new AccountEnvelope {result=true};
                JsonUtility.FromJsonOverwrite(reply,envelope);
                reason=envelope.reason??(!envelope.result?"account-action-refused":"command-refused");
                return envelope.ok && envelope.result;
            }
            var workshopEnvelope=JsonUtility.FromJson<Envelope>(reply);
            reason=workshopEnvelope?.reason??"command-refused";
            return workshopEnvelope!=null && workshopEnvelope.ok;
        }
        void Discard()
        {
            var a=nextAccount;var w=nextInventory;var prepared=equipment;
            nextAccount=null;nextInventory=null;equipment=null;pendingView=null;
            accountReply=workshopReply=nextEquipment=null;ticket=0;
            try { prepared?.Dispose(); }
            finally { try { a?.Dispose(); } finally { w?.Dispose(); } }
        }
        bool Apply(string accountCommand,string workshopCommand,out AccountWorkshopChange refusal)
        {
            if(accountCommand!=null)
            {
                accountReply=nextAccount.Execute(accountCommand);
                if(!Accepted(accountReply,true,out var reason))
                { refusal=Refused(reason,accountReply);return false; }
            }
            if(workshopCommand!=null)
            {
                workshopReply=nextInventory.Execute(workshopCommand);
                if(!Accepted(workshopReply,false,out var reason))
                { refusal=Refused(reason,null,workshopReply);return false; }
            }
            refusal=default;return true;
        }
        AccountWorkshopChange Queue(string extra,string stash)
        {
            var a=nextAccount.Save();var w=nextInventory.Save();
            if(Current!=null && a==Current.AccountJson && w==Current.WorkshopJson &&
                extra==Current.AccountExtraJson && stash==Current.StashJson)
            {
                var unchanged=new AccountWorkshopChange(WorkshopChangeState.Unchanged,accountReply,workshopReply,null);
                Discard();return unchanged;
            }
            if(actor!=null)
            {
                nextEquipment=nextInventory.EquipmentJson();
                if(nextEquipment!=currentEquipment)equipment=actor.PrepareEquipment(nextEquipment);
            }
            var accountRevision=Current?.AccountRevision??0;var workshopRevision=Current?.WorkshopRevision??0;
            pendingView=new AccountWorkshopSnapshot(a,w,extra,stash,accountRevision+1,workshopRevision+1);
            var submitted=storage.Store.SubmitGroup(new SaveWrite(accountSlot,accountRevision,a,extra),
                new SaveWrite(workshopSlot,workshopRevision,w,stash));
            if(!submitted.Succeeded) { Discard();return StorageRefused(submitted); }
            ticket=submitted.Value;return Pending();
        }
        /// <summary>Initializes two empty records together. Starting grants are
        /// host-owned; null accountJson selects the blank shared account. At most
        /// 64 setup commands across both owners run before the first save.</summary>
        public AccountWorkshopChange BeginCreate(uint accountSeed,string accountJson,uint workshopSeed,string workshopStateJson,
            string stashJson,string accountExtraJson="{}",long nextUid=0,string[] accountCommands=null,string[] workshopCommands=null)
        {
            Check();if(IsBusy)return Refused("save-pending");if(Current!=null)return Refused("already-initialized");
            if(stashJson==null || accountExtraJson==null)throw new ArgumentNullException(nameof(stashJson));
            accountCommands=accountCommands??Array.Empty<string>();workshopCommands=workshopCommands??Array.Empty<string>();
            if(accountCommands.Length>64 || workshopCommands.Length>64 || accountCommands.Length+workshopCommands.Length>64)
                throw new ArgumentOutOfRangeException(nameof(accountCommands));
            nextId=1;
            try
            {
                nextAccount=progression.OpenProfile(nextId,accountSeed,accountJson);
                nextInventory=workshop.OpenProfile(nextId,workshopSeed,workshopStateJson,nextUid);
                foreach(var command in accountCommands)
                    if(!Apply(command,null,out var refused)) { Discard();return refused; }
                foreach(var command in workshopCommands)
                    if(!Apply(null,command,out var refused)) { Discard();return refused; }
                return Queue(accountExtraJson,stashJson);
            }
            catch { Discard();throw; }
        }
        /// <summary>Applies authorized commands to private clones. Either command
        /// may be null. A progression result=false rejects the entire proposal.
        /// Pending results expose neither candidate replies nor candidate saves.</summary>
        public AccountWorkshopChange Submit(string accountCommandJson=null,string workshopCommandJson=null,
            string stashJson=null,string accountExtraJson=null)
        {
            Check();if(IsBusy)return Refused("save-pending");if(Current==null)return Refused("not-initialized");
            nextId=currentId==1?2u:1u;
            try
            {
                nextAccount=progression.RestoreProfile(nextId,Current.AccountJson);
                nextInventory=workshop.RestoreProfile(nextId,Current.WorkshopJson);
                if(!Apply(accountCommandJson,workshopCommandJson,out var refused)) { Discard();return refused; }
                return Queue(accountExtraJson??Current.AccountExtraJson,stashJson??Current.StashJson);
            }
            catch { Discard();throw; }
        }
        void Publish(AccountWorkshopSnapshot next)
        {
            if(actor!=null && actor.IsDisposed)throw new ObjectDisposedException(nameof(CombatWorld.Actor));
            equipment?.Publish();equipment=null;
            var retiredAccount=account;var retiredInventory=inventory;
            account=nextAccount;inventory=nextInventory;nextAccount=null;nextInventory=null;
            currentId=nextId;currentEquipment=nextEquipment;nextEquipment=null;
            Current=next;
            try { retiredAccount?.Dispose(); } finally { retiredInventory?.Dispose(); }
        }
        public AccountWorkshopChange Poll()
        {
            // An actor closed after admission must still settle its disk result
            // before publication is refused and this entire owner is closed.
            if(IsDisposed)throw new ObjectDisposedException(nameof(DurableAccountWorkshop));
            if(!IsBusy)return Refused("no-pending-save");
            var saved=storage.Store.Poll(ticket);
            if(saved.Status==SaveStatus.Pending)return Pending();
            if(!saved.Succeeded) { Discard();return StorageRefused(saved); }
            try
            {
                Publish(pendingView);
                var reply=new AccountWorkshopChange(WorkshopChangeState.Committed,accountReply,workshopReply,null,SaveStatus.Ok);
                Discard();return reply;
            }
            catch(Exception error)
            {
                try { Dispose(); } catch(Exception closing) { error=new AggregateException(error,closing); }
                throw new IOException("Account/workshop save committed, but publication failed. Reopen both saved records and the actor.",error);
            }
        }
        public SaveResult CancelPending()
        {
            if(IsDisposed)throw new ObjectDisposedException(nameof(DurableAccountWorkshop));
            if(!IsBusy)throw new InvalidOperationException("No pending account/workshop save.");
            return storage.Store.CancelAsync(ticket);
        }
        public AccountWorkshopChange Reload()
        {
            Check();if(IsBusy)return Refused("save-pending");
            var group=storage.Store.ReadGroup(accountSlot,workshopSlot);
            if(!group.Result.Succeeded)return StorageRefused(group.Result);
            if(group.Records[0].IsEmpty || group.Records[1].IsEmpty)
                return Refused(group.Records[0].IsEmpty==group.Records[1].IsEmpty?"empty-group":"incomplete-group");
            nextId=currentId==1?2u:1u;
            try
            {
                nextAccount=progression.RestoreProfile(nextId,group.Records[0].CraftingJson);
                nextInventory=workshop.RestoreProfile(nextId,group.Records[1].CraftingJson);
                var next=new AccountWorkshopSnapshot(nextAccount.Save(),nextInventory.Save(),group.Records[0].StashJson,
                    group.Records[1].StashJson,group.Records[0].Revision,group.Records[1].Revision);
                if(actor!=null)
                {
                    nextEquipment=nextInventory.EquipmentJson();
                    if(nextEquipment!=currentEquipment)equipment=actor.PrepareEquipment(nextEquipment);
                }
                try { Publish(next); }
                catch { Dispose();throw; }
                Discard();
                return new AccountWorkshopChange(WorkshopChangeState.Reloaded,null,null,null,SaveStatus.Ok);
            }
            catch { Discard();throw; }
        }
        public string Catalogue(uint offset=0,int limit=32)
        {
            Check();if(account==null)throw new InvalidOperationException("Account/workshop is not initialized.");
            return account.Catalogue(offset,limit);
        }
        public string QueryWorkshop(string queryJson) { Check();return workshop.Query(queryJson); }
        public GameplayHost.Metrics ReadAccountMetrics()=>progression.ReadMetrics();
        public GameplayHost.Metrics ReadWorkshopMetrics()=>workshop.ReadMetrics();
        public void Dispose()
        {
            if(closed)return;closed=true;
            try { storage?.Dispose(); }
            finally
            {
                try { equipment?.Dispose(); }
                finally
                {
                    try { progression?.Dispose(); }
                    finally
                    {
                        try { workshop?.Dispose(); }
                        finally
                        {
                            actor?.Dispose();actor=null;equipment=null;nextAccount=account=null;nextInventory=inventory=null;
                            pendingView=null;accountReply=workshopReply=currentEquipment=nextEquipment=null;ticket=0;
                        }
                    }
                }
            }
        }
    }
}
#endif
