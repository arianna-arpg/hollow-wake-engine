using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using HollowWake.Gameplay;
using HollowWake.Storage;
using UnityEngine;

public static class DurableWorkshopReplay
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    static void Register()
    {
        StorageReplay.WorkshopContracts=stage=>Run(stage);
        StorageReplay.WorkshopLifecycleStart=StartLifetime;
        StorageReplay.WorkshopLifecycleEnd=EndLifetime;
    }
#if UNITY_EDITOR
    [UnityEditor.InitializeOnLoadMethod]
    static void RegisterEditor() { Register(); }
#endif
    static DurableWorkshop held;
    public static void StartLifetime(string stage)
    {
        held=new DurableWorkshop(Path.Combine(StorageReplay.Work,stage+"-workshop-lifetime.db"),1);
        Need(held.BeginCreate(17,Initial,Stash,0,Grant).State==WorkshopChangeState.Pending &&
            Finish(held).Succeeded,"Lifecycle seed failed");
        using(var control=new CraftingWorkshop())
        using(var profile=control.RestoreProfile(1,held.Snapshot))
        {
            File.WriteAllText(Path.Combine(StorageReplay.Work,stage+"-workshop-lifetime.previous"),held.Snapshot);
            profile.Execute(Forge);
            File.WriteAllText(Path.Combine(StorageReplay.Work,stage+"-workshop-lifetime.proposed"),profile.Save());
        }
        Need(held.Submit(Forge).State==WorkshopChangeState.Pending,"Lifecycle candidate missing");
    }
    public static void EndLifetime(string stage)
    {
        var metrics=held.ReadMetrics();
        Need(held.IsDisposed && metrics.LiveBytes==0 && metrics.LiveBlocks==0,"Lifecycle retained native workshop or save resources");
        var result=new Result {stage=stage,run=Environment.GetEnvironmentVariable("HWE_STORAGE_RUN"),
            unity=Application.unityVersion,passed=true,closed=true,peakBytes=(long)metrics.PeakBytes};
        File.WriteAllText(Path.Combine(StorageReplay.Work,stage+"-workshop-lifetime.json"),JsonUtility.ToJson(result,true));
        held.Dispose();held=null;
    }
    public const string Initial=@"{""board"":{""w"":6,""h"":6},""items"":[],""overflow"":[],""equipped"":{},""essences"":{},""account"":{""features"":[],""ledger"":{},""craftLore"":{},""progression"":true}}";
    public const string Grant=@"{""op"":""grant-vestige"",""id"":""morren"",""count"":1}";
    public const string Forge=@"{""op"":""mint"",""kind"":""forge"",""options"":{""baseId"":""helmet_armor"",""ilvl"":1,""rarity"":""common"",""sockets"":2,""quality"":0.5}}";
    public const string Stash=@"{""version"":1,""items"":[],""metadata"":{""__proto__"":{""kept"":true},""uid"":9007199254740991,""fraction"":0.125,""text"":""雪 🎒""}}";
    [Serializable] class MintReply { public bool ok;public Mint result; }
    [Serializable] class Mint { public long uid; }
    [Serializable] public class Result
    {
        public string run,stage,unity;
        public bool passed,initialPublication,commitPublication,busyRecovery,staleRecovery,payloadRecovery,
            noOpNoWrite,refusedCommand,invalidReload,exactContinuation,closed;
        public string cancellation;
        public long revision,firstUid,peakBytes,finalLiveBytes,finalLiveBlocks;
    }
    static void Need(bool value,string reason)=>StorageReplay.Need(value,reason);
    static string Inlay(long uid)=>"{\"op\":\"inlay-vestige\",\"uid\":"+uid.ToString(CultureInfo.InvariantCulture)+",\"id\":\"morren\"}";
    public static WorkshopChange Finish(DurableWorkshop workshop)
    {
        var timer=Stopwatch.StartNew();
        for(;;)
        {
            var reply=workshop.Poll();
            if(reply.State!=WorkshopChangeState.Pending)return reply;
            Need(timer.ElapsedMilliseconds<10000,"Workshop save completion timeout");
            Thread.Sleep(1);
        }
    }
    static WorkshopChange Submit(DurableWorkshop owner,string command,string stash=null)
    {
        string before=owner.Snapshot,oldStash=owner.StashJson;ulong revision=owner.Revision;
        var started=owner.Submit(command,stash);
        Need(started.State==WorkshopChangeState.Pending && started.ReplyJson==null && owner.IsBusy,"Expected private pending command");
        Need(owner.Snapshot==before && owner.StashJson==oldStash && owner.Revision==revision,"Candidate published before commit observation");
        Need(owner.Submit(command).Reason=="save-pending" && owner.Reload().Reason=="save-pending","Overlapping change admitted");
        return Finish(owner);
    }
    static void Pair(SlotStore store,DurableWorkshop owner)
    {
        var row=store.Read(1);
        StorageReplay.Exact(row,owner.Revision,owner.Snapshot,owner.StashJson);
    }
    static void PeerWrite(SlotStore peer,ulong expected,string body,string stash)
    {
        var staged=peer.Stage(1,expected,body,stash);
        Need(staged.Succeeded && peer.Commit(staged.Value).Succeeded,"Peer write failed");
    }
    public static Result Run(string stage)
    {
        var result=new Result {stage=stage,run=Environment.GetEnvironmentVariable("HWE_STORAGE_RUN"),unity=Application.unityVersion};
        var file=Path.Combine(StorageReplay.Work,stage+"-workshop.db");
        var owner=new DurableWorkshop(file,1);
        try
        {
            Need(!owner.IsReady && owner.Snapshot==null && owner.Revision==0,"Empty durable workshop");
            var created=owner.BeginCreate(17,Initial,Stash,4294967297,Grant);
            Need(created.State==WorkshopChangeState.Pending && !owner.IsReady && owner.Snapshot==null && owner.Revision==0,"Initial profile published early");
            Need(Finish(owner).State==WorkshopChangeState.Committed && owner.IsReady && owner.Revision==1,"Initial commit");
            result.initialPublication=true;
            using(var baseline=new CraftingWorkshop())
            using(var control=baseline.OpenProfile(1,17,Initial,4294967297))
            using(var peerOwner=StorageReplay.Open(stage+"-workshop.db"))
            {
                var peer=peerOwner.Store;
                control.Execute(Grant);
                Need(owner.Snapshot==control.Save() && owner.StashJson==Stash,"Initial grant or snapshot differs");
                var expected=control.Execute(Forge);
                var forged=Submit(owner,Forge);
                Need(forged.State==WorkshopChangeState.Committed && forged.ReplyJson==expected && owner.Snapshot==control.Save(),"First durable forge differs");
                var first=JsonUtility.FromJson<MintReply>(forged.ReplyJson);
                Need(first.ok && first.result.uid==4294967297L,"Large item ID lost");
                result.firstUid=first.result.uid;result.commitPublication=true;Pair(peer,owner);
                var before=owner.Snapshot;var revision=owner.Revision;
                var blocker=peer.Stage(1,revision,before,Stash);
                Need(blocker.Succeeded,"Competing writer did not stage");
                var busy=Submit(owner,Forge);
                Need(busy.State==WorkshopChangeState.Refused && busy.StorageStatus==SaveStatus.Busy &&
                    owner.Snapshot==before && owner.Revision==revision && !owner.IsBusy,"Busy writer changed visible state");
                Need(peer.Cancel(blocker.Value).Succeeded,"Cancel competing write");
                expected=control.Execute(Forge);
                var retry=Submit(owner,Forge);
                Need(retry.Succeeded && retry.ReplyJson==expected && owner.Snapshot==control.Save(),"Busy retry lost RNG or IDs");
                result.busyRecovery=true;Pair(peer,owner);
                before=owner.Snapshot;revision=owner.Revision;
                PeerWrite(peer,revision,before,Stash);
                var stale=Submit(owner,Inlay(result.firstUid));
                Need(stale.State==WorkshopChangeState.Refused && stale.StorageStatus==SaveStatus.StaleRevision &&
                    owner.Snapshot==before && owner.Revision==revision,"Stale writer published a candidate");
                Need(owner.Reload().State==WorkshopChangeState.Reloaded && owner.Revision==revision+1 && owner.Snapshot==before,"Reload did not adopt durable revision");
                expected=control.Execute(Inlay(result.firstUid));
                var inlaid=Submit(owner,Inlay(result.firstUid));
                Need(inlaid.Succeeded && inlaid.ReplyJson==expected && owner.Snapshot==control.Save(),"Inlay retry changed custody");
                result.staleRecovery=true;Pair(peer,owner);
                before=owner.Snapshot;revision=owner.Revision;
                var unchanged=owner.Submit("{\"op\":\"recover\",\"uid\":"+result.firstUid.ToString(CultureInfo.InvariantCulture)+"}");
                Need(unchanged.State==WorkshopChangeState.Unchanged && owner.Snapshot==before && owner.Revision==revision && !owner.IsBusy,"No-op issued a save");
                Pair(peer,owner);result.noOpNoWrite=true;
                var refused=owner.Submit("{\"op\":\"not-a-command\"}");
                Need(refused.State==WorkshopChangeState.Refused && owner.Snapshot==before && owner.Revision==revision && !owner.IsBusy,"Refused command changed view");
                result.refusedCommand=true;
                var oversized=owner.Submit(Forge,new string('x',SlotStore.DocumentLimit+1));
                Need(oversized.State==WorkshopChangeState.Refused && oversized.StorageStatus==SaveStatus.PayloadSize &&
                    owner.Snapshot==before && owner.Revision==revision && !owner.IsBusy,"Rejected payload changed view");
                expected=control.Execute(Forge);
                retry=Submit(owner,Forge);
                Need(retry.Succeeded && retry.ReplyJson==expected && owner.Snapshot==control.Save(),"Payload retry lost RNG or IDs");
                result.payloadRecovery=true;Pair(peer,owner);
                before=owner.Snapshot;revision=owner.Revision;
                Need(owner.Submit(Forge).State==WorkshopChangeState.Pending,"Cancellation candidate missing");
                Need(owner.Snapshot==before && owner.Revision==revision,"Cancellation candidate published early");
                var cancellation=owner.CancelPending();var completion=Finish(owner);
                if(cancellation.Succeeded)
                {
                    Need(completion.State==WorkshopChangeState.Refused && completion.StorageStatus==SaveStatus.Cancelled &&
                        owner.Snapshot==before && owner.Revision==revision,"Cancellation changed view");
                    result.cancellation="cancelled-before-commit";
                }
                else
                {
                    Need(cancellation.Status==SaveStatus.TooLate && completion.State==WorkshopChangeState.Committed,"Late cancellation hid completion");
                    expected=control.Execute(Forge);
                    Need(completion.ReplyJson==expected && owner.Snapshot==control.Save(),"Late completion differs");
                    result.cancellation="admitted-commit-observed";
                }
                Pair(peer,owner);
                before=owner.Snapshot;revision=owner.Revision;
                PeerWrite(peer,revision,"{}",Stash);
                bool rejected=false;
                try{owner.Reload();}catch(InvalidOperationException){rejected=true;}
                Need(rejected && owner.Snapshot==before && owner.Revision==revision,"Invalid saved profile replaced valid view");
                PeerWrite(peer,revision+1,before,Stash);
                Need(owner.Reload().State==WorkshopChangeState.Reloaded && owner.Revision==revision+2 && owner.Snapshot==before,"Valid reload after corruption refusal");
                result.invalidReload=true;
                expected=control.Execute(Forge);
                var continued=Submit(owner,Forge);
                Need(continued.Succeeded && continued.ReplyJson==expected && owner.Snapshot==control.Save(),"Final continuation differs");
                result.exactContinuation=true;Pair(peer,owner);
                result.revision=(long)owner.Revision;
                File.WriteAllText(Path.Combine(StorageReplay.Work,stage+"-workshop.expected"),control.Save(),new UTF8Encoding(false));
                File.WriteAllText(Path.Combine(StorageReplay.Work,stage+"-workshop-stash.expected"),Stash,new UTF8Encoding(false));
                result.peakBytes=(long)owner.ReadMetrics().PeakBytes;
                Need(result.peakBytes<=32L*1024*1024,"Workshop exceeded its existing heap limit");
            }
        }
        finally { owner.Dispose(); }
        result.closed=owner.IsDisposed;
        var metrics=owner.ReadMetrics();
        result.finalLiveBytes=(long)metrics.LiveBytes;result.finalLiveBlocks=(long)metrics.LiveBlocks;
        Need(result.closed && metrics.LiveBytes==0 && metrics.LiveBlocks==0,"Durable workshop leaked native gameplay state");
        result.passed=true;
        File.WriteAllText(Path.Combine(StorageReplay.Work,stage+"-workshop.json"),JsonUtility.ToJson(result,true),new UTF8Encoding(false));
        return result;
    }
}
