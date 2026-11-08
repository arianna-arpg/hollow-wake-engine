using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using HollowWake.Gameplay;
using HollowWake.Storage;
using UnityEngine;

public sealed class AccountStorageReplay : MonoBehaviour
{
    [Serializable] public class Inputs { public string account,state,config,purchase,memory,forge,equip,invalidWorkshop,extra,stash; }
    [Serializable] public class Result
    {
        public string stage,unity,cancellation;
        public bool passed,closed,accountRefusal,workshopRollback,busy,stale,invalidReload,publicationFailureClosed;
        public long accountPeak,workshopPeak;
    }
    public static string Work=>Environment.GetEnvironmentVariable("HWE_ACCOUNT_STORAGE_WORK");
    public static void Need(bool value,string message) { if(!value)throw new Exception(message); }
    static void Write(string name,string value)=>File.WriteAllText(Path.Combine(Work,name),value);
    static void Capture(string stage,string name,AccountWorkshopSnapshot view)
    {
        Write(stage+"-"+name+"-account.json",view.AccountJson);Write(stage+"-"+name+"-workshop.json",view.WorkshopJson);
    }
    static AccountWorkshopChange Finish(DurableAccountWorkshop owner)
    {
        var clock=Stopwatch.StartNew();
        for(;;) { var reply=owner.Poll();if(reply.State!=WorkshopChangeState.Pending)return reply;
            Need(clock.ElapsedMilliseconds<10000,"Grouped save timed out");Thread.Sleep(1); }
    }
    static void Pending(DurableAccountWorkshop owner,string a,string w)
    {
        var before=owner.Current;
        var reply=owner.Submit(a,w);
        Need(reply.State==WorkshopChangeState.Pending && reply.AccountReplyJson==null && reply.WorkshopReplyJson==null,"Expected private pending group");
        Need(ReferenceEquals(owner.Current,before),"Group published before commit observation");
        Need(owner.Submit(a,w).Reason=="save-pending" && owner.Reload().Reason=="save-pending","Overlapping group admitted");
    }
    static void Pair(SlotStore peer,AccountWorkshopSnapshot view)
    {
        var records=peer.ReadGroup(10,20);
        Need(records.Result.Succeeded && records.Records[0].Revision==view.AccountRevision &&
            records.Records[1].Revision==view.WorkshopRevision && records.Records[0].CraftingJson==view.AccountJson &&
            records.Records[1].CraftingJson==view.WorkshopJson && records.Records[0].StashJson==view.AccountExtraJson &&
            records.Records[1].StashJson==view.StashJson,"Durable group differs from published view");
    }
    static void Replace(SlotStore peer,uint slot,ulong revision,string text,string extra)
    {
        var staged=peer.Stage(slot,revision,text,extra);
        Need(staged.Succeeded && peer.Commit(staged.Value).Succeeded,"Independent writer failed");
    }
    static DurableAccountWorkshop Create(string file,Inputs input,CombatWorld.Actor actor=null)
    {
        var owner=actor==null?new DurableAccountWorkshop(file,10,20):new DurableAccountWorkshop(file,10,20,actor);
        try
        {
            var reply=owner.BeginCreate(1,input.account,17,input.state,input.stash,input.extra);
            Need(reply.State==WorkshopChangeState.Pending && owner.Current==null && !owner.IsReady,"Initial group published early");
            Need(Finish(owner).State==WorkshopChangeState.Committed && owner.IsReady,"Initial group commit failed");
            return owner;
        }
        catch { owner.Dispose();throw; }
    }
    public static void Run(string stage)
    {
        var input=JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(Work,"inputs.json")));
        var file=Path.Combine(Work,stage+".db");
        var world=new CombatWorld();var actor=world.CreateActor(input.config);
        var owner=Create(file,input,actor);var peer=new SlotStore();
        var result=new Result {stage=stage,unity=Application.unityVersion};
        try
        {
            Need(peer.Open(file).Succeeded,"Peer open");
            Capture(stage,"initial",owner.Current);Pair(peer,owner.Current);
            Pending(owner,input.purchase,input.forge);
            Need(Finish(owner).State==WorkshopChangeState.Committed,"Pair commit");
            Capture(stage,"pair",owner.Current);Pair(peer,owner.Current);
            var before=owner.Current;
            var refused=owner.Submit(input.purchase,input.forge);
            Need(refused.State==WorkshopChangeState.Refused && refused.Reason=="account-action-refused" &&
                refused.WorkshopReplyJson==null && ReferenceEquals(before,owner.Current),"Refused purchase admitted paired inventory");
            Pair(peer,before);result.accountRefusal=true;
            refused=owner.Submit(input.memory,input.invalidWorkshop);
            Need(refused.State==WorkshopChangeState.Refused && refused.AccountReplyJson==null &&
                ReferenceEquals(before,owner.Current),"Workshop refusal retained account proposal: "+refused.State+" "+refused.Reason+" "+refused.AccountReplyJson+" "+refused.WorkshopReplyJson);
            Pair(peer,before);result.workshopRollback=true;
            actor.Press();actor.Advance(.1);
            Pending(owner,input.memory,input.equip);actor.Advance(.1);
            Write(stage+"-combat-before.json",actor.Save());
            Need(Finish(owner).State==WorkshopChangeState.Committed,"Memory/equipment commit");
            Write(stage+"-combat-after.json",actor.Save());Capture(stage,"equipped",owner.Current);Pair(peer,owner.Current);
            before=owner.Current;
            var held=peer.Stage(20,before.WorkshopRevision,before.WorkshopJson,before.StashJson);
            Need(held.Succeeded,"Hold competing writer");
            Pending(owner,input.memory,input.forge);
            var completion=Finish(owner);
            Need(completion.StorageStatus==SaveStatus.Busy && ReferenceEquals(before,owner.Current),"Busy group published candidates");
            Need(peer.Cancel(held.Value).Succeeded,"Release competing writer");Pair(peer,before);result.busy=true;
            Replace(peer,20,before.WorkshopRevision,before.WorkshopJson,before.StashJson+" ");
            Pending(owner,input.memory,input.forge);
            completion=Finish(owner);
            Need(completion.StorageStatus==SaveStatus.StaleRevision && ReferenceEquals(before,owner.Current),"Late stale group published candidates");
            var stale=peer.ReadGroup(10,20);
            Need(stale.Records[0].Revision==before.AccountRevision && stale.Records[0].CraftingJson==before.AccountJson &&
                stale.Records[1].Revision==before.WorkshopRevision+1,"Late stale group committed its account prefix");
            Need(owner.Reload().State==WorkshopChangeState.Reloaded,"Reload competing write");result.stale=true;
            Pending(owner,input.memory,input.forge);
            Need(Finish(owner).State==WorkshopChangeState.Committed,"Continuation commit");
            Capture(stage,"continued",owner.Current);Pair(peer,owner.Current);
            before=owner.Current;
            Need(owner.Submit().State==WorkshopChangeState.Unchanged && ReferenceEquals(before,owner.Current),"No-op wrote a group");
            for(int cycle=0;cycle<128;cycle++)
                Need(owner.Submit().State==WorkshopChangeState.Unchanged && ReferenceEquals(before,owner.Current),"Repeated candidate retirement changed a profile");
            refused=owner.Submit(input.memory,input.forge,new string('x',SlotStore.DocumentLimit+1));
            Need(refused.StorageStatus==SaveStatus.PayloadSize && ReferenceEquals(before,owner.Current),"Oversize group changed current view");
            Pair(peer,before);
            Pending(owner,input.memory,input.forge);
            var cancelled=owner.CancelPending();completion=Finish(owner);
            if(cancelled.Succeeded)
            {
                Need(completion.StorageStatus==SaveStatus.Cancelled && ReferenceEquals(before,owner.Current),"Cancelled group published");
                result.cancellation="cancelled";
            }
            else
            {
                Need(cancelled.Status==SaveStatus.TooLate && completion.State==WorkshopChangeState.Committed,"Cancellation boundary was hidden");
                result.cancellation="committed";
            }
            Capture(stage,"cancellation",owner.Current);Pair(peer,owner.Current);
            before=owner.Current;
            Replace(peer,20,before.WorkshopRevision,"{}",before.StashJson);
            bool threw=false;try { owner.Reload(); } catch(InvalidOperationException) { threw=true; }
            Need(threw && ReferenceEquals(before,owner.Current) && owner.IsReady,"Invalid second record replaced a valid account");
            Replace(peer,20,before.WorkshopRevision+1,before.WorkshopJson,before.StashJson);
            Need(owner.Reload().Succeeded,"Recover valid group");Pair(peer,owner.Current);result.invalidReload=true;
            var final=owner.Current;
            result.accountPeak=(long)owner.ReadAccountMetrics().PeakBytes;result.workshopPeak=(long)owner.ReadWorkshopMetrics().PeakBytes;
            owner.Dispose();
            Need(owner.IsDisposed && owner.ReadAccountMetrics().LiveBytes==0 && owner.ReadWorkshopMetrics().LiveBytes==0,"Disposed group retained native owners");
            owner=new DurableAccountWorkshop(file,10,20);
            Need(owner.Current.AccountJson==final.AccountJson && owner.Current.WorkshopJson==final.WorkshopJson &&
                owner.Current.AccountRevision==final.AccountRevision && owner.Current.WorkshopRevision==final.WorkshopRevision,"Restart lost a group owner");
            Pair(peer,owner.Current);
            Write(stage+"-final-view.json",JsonUtility.ToJson(new PersistedView(owner.Current)));
            result.accountPeak=Math.Max(result.accountPeak,(long)owner.ReadAccountMetrics().PeakBytes);
            result.workshopPeak=Math.Max(result.workshopPeak,(long)owner.ReadWorkshopMetrics().PeakBytes);
            PublicationFailure(stage,input);result.publicationFailureClosed=true;
            IncompleteGroup(stage,input);
            result.passed=true;
        }
        finally
        {
            peer.Dispose();owner.Dispose();world.Dispose();
            result.closed=owner.IsDisposed && owner.ReadAccountMetrics().LiveBytes==0 && owner.ReadAccountMetrics().LiveBlocks==0 &&
                owner.ReadWorkshopMetrics().LiveBytes==0 && owner.ReadWorkshopMetrics().LiveBlocks==0;
        }
        Need(result.closed,"Group owners remained live");Write(stage+"-result.json",JsonUtility.ToJson(result,true));
    }
    [Serializable] public class PersistedView
    {
        public string account,workshop,extra,stash;public long accountRevision,workshopRevision;
        public PersistedView(AccountWorkshopSnapshot view)
        { account=view.AccountJson;workshop=view.WorkshopJson;extra=view.AccountExtraJson;stash=view.StashJson;
            accountRevision=(long)view.AccountRevision;workshopRevision=(long)view.WorkshopRevision; }
    }
    static void PublicationFailure(string stage,Inputs input)
    {
        var file=Path.Combine(Work,stage+"-publication.db");
        using(var world=new CombatWorld())
        {
            var actor=world.CreateActor(input.config);
            using(var owner=Create(file,input,actor))
            using(var peer=new SlotStore())
            {
                Need(peer.Open(file).Succeeded,"Publication peer");
                var before=owner.Current;Pending(owner,input.memory,input.equip);
                var clock=Stopwatch.StartNew();
                for(;;)
                {
                    var read=peer.ReadGroup(10,20);
                    Need(read.Result.Succeeded,"Publication read");
                    if(read.Records[0].Revision==2 && read.Records[1].Revision==2)break;
                    Need(clock.ElapsedMilliseconds<10000,"Publication save did not commit");Thread.Sleep(1);
                }
                actor.Dispose();
                bool threw=false;try { Finish(owner); } catch(IOException) { threw=true; }
                Need(threw && owner.IsDisposed && ReferenceEquals(before,owner.Current),"Post-commit publication failure left owner live");
                Need(owner.ReadAccountMetrics().LiveBytes==0 && owner.ReadWorkshopMetrics().LiveBytes==0,"Failed publication leaked owners");
            }
            using(var restored=new DurableAccountWorkshop(file,10,20))
            {
                Capture(stage,"publication-failure",restored.Current);
                Need(restored.Current.AccountRevision==2 && restored.Current.WorkshopRevision==2,"Committed group was reported as rollback");
            }
        }
    }
    static void IncompleteGroup(string stage,Inputs input)
    {
        var file=Path.Combine(Work,stage+"-incomplete.db");
        using(var progress=new AccountProgression())
        using(var profile=progress.OpenProfile(1,1,input.account))
        using(var peer=new SlotStore())
        {
            Need(peer.Open(file).Succeeded,"Incomplete peer");
            Replace(peer,10,0,profile.Save(),input.extra);
            bool threw=false;
            try { using(var owner=new DurableAccountWorkshop(file,10,20)){} } catch(IOException) { threw=true; }
            Need(threw && peer.Read(10).Revision==1 && peer.Read(20).IsEmpty,"Incomplete group was silently initialized");
        }
    }
    static DurableAccountWorkshop lifecycleOwner;
    static CombatWorld lifecycleWorld;
    static CombatWorld.Actor lifecycleActor;
    static SlotStore lifecyclePeer;
    static ulong lifecycleHeld;
    static AccountWorkshopSnapshot lifecycleBefore;
    public static void StartLifecycle(string stage)
    {
        Need(lifecycleOwner==null,"Previous lifecycle owner retained");
        var input=JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(Work,"inputs.json")));
        lifecycleWorld=new CombatWorld();lifecycleActor=lifecycleWorld.CreateActor(input.config);
        lifecycleOwner=Create(Path.Combine(Work,stage+".db"),input,lifecycleActor);
        lifecycleBefore=lifecycleOwner.Current;
        lifecyclePeer=new SlotStore();
        Need(lifecyclePeer.Open(Path.Combine(Work,stage+".db")).Succeeded,"Lifecycle peer");
        var held=lifecyclePeer.Stage(20,lifecycleBefore.WorkshopRevision,lifecycleBefore.WorkshopJson,lifecycleBefore.StashJson);
        Need(held.Succeeded,"Lifecycle writer hold");lifecycleHeld=held.Value;
        Pending(lifecycleOwner,input.memory,input.forge);
    }
    public static void EndLifecycle(string stage)
    {
        try
        {
            Need(lifecycleOwner.IsDisposed && lifecycleActor.IsDisposed,"Lifecycle retained group or actor");
            Need(lifecycleOwner.ReadAccountMetrics().LiveBytes==0 && lifecycleOwner.ReadAccountMetrics().LiveBlocks==0 &&
                lifecycleOwner.ReadWorkshopMetrics().LiveBytes==0 && lifecycleOwner.ReadWorkshopMetrics().LiveBlocks==0,
                "Lifecycle retained gameplay allocations");
            Need(ReferenceEquals(lifecycleBefore,lifecycleOwner.Current),"Lifecycle published unobserved candidates");
            Need(lifecyclePeer.Cancel(lifecycleHeld).Succeeded,"Lifecycle writer release");
            Pair(lifecyclePeer,lifecycleBefore);
            Write(stage+"-lifecycle.json",JsonUtility.ToJson(new LifecycleResult {passed=true,closed=true,stage=stage}));
        }
        finally
        {
            lifecyclePeer?.Dispose();lifecycleOwner?.Dispose();lifecycleWorld?.Dispose();
            lifecycleOwner=null;lifecyclePeer=null;lifecycleWorld=null;lifecycleActor=null;lifecycleBefore=null;
        }
    }
    [Serializable] public class LifecycleResult {public bool passed,closed;public string stage;}
    void Start()
    {
        try { Run("player");Application.Quit(0); }
        catch(Exception error) { UnityEngine.Debug.LogException(error);Application.Quit(1); }
    }
}
