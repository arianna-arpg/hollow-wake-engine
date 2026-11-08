using System;
using System.IO;
using HollowWake.Gameplay;
using UnityEngine;

namespace HollowWake.Storage
{
    public enum WorkshopChangeState { Pending, Committed, Unchanged, Reloaded, Refused }
    public readonly struct WorkshopChange
    {
        public readonly WorkshopChangeState State;
        public readonly string ReplyJson, Reason;
        public readonly SaveStatus? StorageStatus;
        public readonly int SqliteCode;
        public bool Succeeded => State==WorkshopChangeState.Committed || State==WorkshopChangeState.Unchanged || State==WorkshopChangeState.Reloaded;
        internal WorkshopChange(WorkshopChangeState state,string reply,string reason,SaveStatus? storage=null,int code=0)
        { State=state;ReplyJson=reply;Reason=reason;StorageStatus=storage;SqliteCode=code; }
    }

    /// <summary>One durable workshop slot. Commands run on a private candidate;
    /// only a successful disk commit replaces the visible snapshot and revision.
    /// The caller owns station authority and the meaning of the stash document.</summary>
    public sealed class DurableWorkshop : IDisposable
    {
        readonly UnitySaveStore storage;
        readonly CraftingWorkshop workshop;
        readonly uint slot;
        CraftingWorkshop.Profile current, candidate;
        uint currentId, candidateId;
        ulong ticket;
        string candidateSnapshot, candidateStash, candidateReply;
        bool closed;
#if HWE_STORAGE_LIVE_EQUIPMENT
        CombatWorld.Actor actor;
        CombatWorld.Actor.PreparedEquipment equipment;
        string currentEquipment, candidateEquipment;
        /// <summary>Transfers actor lifetime to this durable workshop, including
        /// closure after a committed save cannot be published. Dispose the world
        /// after this owner. Poll at a main-thread simulation boundary.</summary>
        public DurableWorkshop(string absolutePath,uint slot,CombatWorld.Actor actor) : this(absolutePath,slot)
        {
            try
            {
                this.actor=actor??throw new ArgumentNullException(nameof(actor));
                if(current!=null)
                {
                    currentEquipment=current.EquipmentJson();
                    using(var initial=actor.PrepareEquipment(currentEquipment))initial.Publish();
                }
            }
            catch { Dispose();throw; }
        }
#endif
        [Serializable] class Envelope { public bool ok;public string reason; }
        public string Snapshot { get; private set; }
        public string StashJson { get; private set; }
        public ulong Revision { get; private set; }
        public bool IsReady => current!=null && !IsDisposed;
        public bool IsBusy => ticket!=0;
        public bool IsDisposed => closed || storage.IsDisposed;

        public DurableWorkshop(string absolutePath,uint slot)
        {
            if(slot>65535)throw new ArgumentOutOfRangeException(nameof(slot));
            this.slot=slot;
            storage=new UnitySaveStore();
            try
            {
                var opened=storage.Store.Open(absolutePath);
                if(!opened.Succeeded)throw new IOException("Workshop storage refused: "+opened.Status);
                var record=storage.Store.Read(slot);
                if(!record.Result.Succeeded)throw new IOException("Workshop read refused: "+record.Result.Status);
                workshop=new CraftingWorkshop();
                if(!record.IsEmpty)
                {
                    current=workshop.RestoreProfile(1,record.CraftingJson);
                    currentId=1;Snapshot=current.Save();StashJson=record.StashJson;Revision=record.Revision;
                }
                // Retire the workshop whenever its storage owner is closed,
                // including entering Play with domain reload disabled.
                storage.Closed=Dispose;
            }
            catch
            {
                try { workshop?.Dispose(); }
                finally { storage.Dispose(); }
                throw;
            }
        }
        void Check() { if(IsDisposed)throw new ObjectDisposedException(nameof(DurableWorkshop)); }
        static WorkshopChange Refused(string reason,string reply=null) =>
            new WorkshopChange(WorkshopChangeState.Refused,reply,reason);
        static WorkshopChange StorageRefused(SaveResult result) =>
            new WorkshopChange(WorkshopChangeState.Refused,null,result.Status.ToString(),result.Status,result.SqliteCode);
        static WorkshopChange Pending() => new WorkshopChange(WorkshopChangeState.Pending,null,null,SaveStatus.Pending);
        static bool Accepted(string reply,out string reason)
        {
            var envelope=JsonUtility.FromJson<Envelope>(reply);
            reason=envelope?.reason??"command-refused";
            return envelope!=null && envelope.ok;
        }
        void Discard()
        {
            var retired=candidate;candidate=null;ticket=0;
            candidateSnapshot=candidateStash=candidateReply=null;
            try {
#if HWE_STORAGE_LIVE_EQUIPMENT
                var pending=equipment;equipment=null;candidateEquipment=null;pending?.Dispose();
#endif
            }
            finally { retired?.Dispose(); }
        }
        WorkshopChange Queue(string stash)
        {
            candidateSnapshot=candidate.Save();candidateStash=stash;
            if(current!=null && candidateSnapshot==Snapshot && stash==StashJson)
            {
                var reply=candidateReply;Discard();
                return new WorkshopChange(WorkshopChangeState.Unchanged,reply,null);
            }
#if HWE_STORAGE_LIVE_EQUIPMENT
            if(actor!=null)
            {
                if(actor.IsDisposed)throw new ObjectDisposedException(nameof(CombatWorld.Actor));
                candidateEquipment=candidate.EquipmentJson();
                if(candidateEquipment!=currentEquipment)equipment=actor.PrepareEquipment(candidateEquipment);
            }
#endif
            var submitted=storage.Store.Submit(slot,Revision,candidateSnapshot,stash);
            if(!submitted.Succeeded) { Discard();return StorageRefused(submitted); }
            ticket=submitted.Value;
            return Pending();
        }
        /// <summary>Creates an empty durable slot exactly once. Setup commands
        /// run before the first commit; existing slots must be loaded or reloaded.</summary>
        public WorkshopChange BeginCreate(uint seed,string stateJson,string stashJson,long nextUid=0,params string[] setupCommands)
        {
            Check();
            if(IsBusy)return Refused("save-pending");
            if(current!=null)return Refused("already-initialized");
            if(stashJson==null)throw new ArgumentNullException(nameof(stashJson));
            if(setupCommands==null)throw new ArgumentNullException(nameof(setupCommands));
            if(setupCommands.Length>64)throw new ArgumentOutOfRangeException(nameof(setupCommands));
            candidateId=1;
            try
            {
                candidate=workshop.OpenProfile(candidateId,seed,stateJson,nextUid);
                foreach(var command in setupCommands)
                {
                    candidateReply=candidate.Execute(command);
                    if(!Accepted(candidateReply,out var reason))
                    {
                        var reply=candidateReply;Discard();return Refused(reason,reply);
                    }
                }
                return Queue(stashJson);
            }
            catch { Discard();throw; }
        }
        /// <summary>Stages one authorized command and an optional new stash
        /// document. Pending results expose no candidate reply or snapshot.</summary>
        public WorkshopChange Submit(string commandJson,string stashJson=null)
        {
            Check();
            if(IsBusy)return Refused("save-pending");
            if(current==null)return Refused("not-initialized");
            if(commandJson==null)throw new ArgumentNullException(nameof(commandJson));
            candidateId=currentId==1?2u:1u;
            try
            {
                candidate=workshop.RestoreProfile(candidateId,Snapshot);
                candidateReply=candidate.Execute(commandJson);
                if(!Accepted(candidateReply,out var reason))
                {
                    var reply=candidateReply;Discard();return Refused(reason,reply);
                }
                return Queue(stashJson??StashJson);
            }
            catch { Discard();throw; }
        }
        public WorkshopChange Poll()
        {
            Check();
            if(!IsBusy)return Refused("no-pending-save");
            var result=storage.Store.Poll(ticket);
            if(result.Status==SaveStatus.Pending)return Pending();
            if(!result.Succeeded) { Discard();return StorageRefused(result); }
            try
            {
#if HWE_STORAGE_LIVE_EQUIPMENT
                if(actor!=null && actor.IsDisposed)throw new ObjectDisposedException(nameof(CombatWorld.Actor));
                equipment?.Publish();equipment=null;currentEquipment=candidateEquipment;candidateEquipment=null;
#endif
            var retired=current;
            current=candidate;currentId=candidateId;candidate=null;
            Snapshot=candidateSnapshot;StashJson=candidateStash;Revision++;
            var reply=candidateReply;ticket=0;
            candidateSnapshot=candidateStash=candidateReply=null;
            retired?.Dispose();
            return new WorkshopChange(WorkshopChangeState.Committed,reply,null,SaveStatus.Ok);
            }
            catch(Exception error)
            {
                // The disk commit already happened. Never report a rollback or
                // allow a stale actor to continue; reopen from the durable slot.
                try { Dispose(); }
                catch(Exception closing) { error=new AggregateException(error,closing); }
                throw new IOException("Workshop save committed, but live publication failed. Reopen the saved slot and actor.",error);
            }
        }
        public SaveResult CancelPending()
        {
            Check();
            if(!IsBusy)throw new InvalidOperationException("No pending workshop save.");
            return storage.Store.CancelAsync(ticket);
        }
        /// <summary>Revalidates an existing durable profile before replacing
        /// the current view. An invalid saved profile leaves that view intact.</summary>
        public WorkshopChange Reload()
        {
            Check();
            if(IsBusy)return Refused("save-pending");
            var record=storage.Store.Read(slot);
            if(!record.Result.Succeeded)return StorageRefused(record.Result);
            if(record.IsEmpty)return Refused("empty-slot");
            var id=currentId==1?2u:1u;
            var restored=workshop.RestoreProfile(id,record.CraftingJson);
            string normalized;
            try {
                normalized=restored.Save();
#if HWE_STORAGE_LIVE_EQUIPMENT
                if(actor!=null)
                {
                    var equipped=restored.EquipmentJson();
                    using(var projection=actor.PrepareEquipment(equipped))
                    {
                        try { projection.Publish(); }
                        catch { Dispose();throw; }
                    }
                    currentEquipment=equipped;
                }
#endif
            }
            catch { restored.Dispose();throw; }
            var retired=current;
            current=restored;currentId=id;Snapshot=normalized;StashJson=record.StashJson;Revision=record.Revision;
            retired?.Dispose();
            return new WorkshopChange(WorkshopChangeState.Reloaded,null,null,SaveStatus.Ok);
        }
        public string Query(string queryJson) { Check();return workshop.Query(queryJson); }
        public GameplayHost.Metrics ReadMetrics() => workshop.ReadMetrics();
        public void Dispose()
        {
            if(closed)return;closed=true;
            try { storage.Dispose(); }
            finally
            {
                try { candidate?.Dispose(); }
                finally
                {
                    try { current?.Dispose(); }
                    finally {
                        try { workshop.Dispose();candidate=current=null; }
                        finally {
#if HWE_STORAGE_LIVE_EQUIPMENT
                            try { actor?.Dispose(); }
                            finally { equipment?.Dispose();equipment=null;actor=null; }
#endif
                        }
                    }
                }
            }
        }
    }
}
