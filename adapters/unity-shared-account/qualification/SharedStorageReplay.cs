using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using HollowWake.Gameplay;
using HollowWake.Storage;
using UnityEngine;

public sealed class SharedStorageReplay : MonoBehaviour
{
    [Serializable] class Inputs { public string key,fields,inventory,memory,salvage,invalid,locked;public uint accountSeed,inventorySeed; }
    [Serializable] class Inner { public bool result; }
    [Serializable] class Outer { public Inner reply; }
    [Serializable] class Replies { public Outer[] rows; }
    [Serializable] class Result { public bool passed,closed,policyRollback,exceptionRollback,invalidRollback,busy,staleDependency,reopened,publicationFailureClosed,incompleteGroupRefused;public string stage,unity,cancellation;public ulong peak; }
    public static string Work=>Environment.GetEnvironmentVariable("HWE_SHARED_STORAGE_WORK");
    public static void Need(bool value,string message){if(!value)throw new Exception(message);}
    static SharedAccountChange Finish(DurableSharedAccount owner)
    {
        var timer=Stopwatch.StartNew();for(;;){var reply=owner.Poll();if(reply.State!=WorkshopChangeState.Pending)return reply;
            Need(timer.ElapsedMilliseconds<10000,"Shared save timeout");Thread.Sleep(1);}
    }
    static SharedAccountAction[] Batch(Inputs input)=>new[]{new SharedAccountAction(-1,input.memory),new SharedAccountAction(0,input.salvage),new SharedAccountAction(1,input.salvage)};
    static SharedInventoryStart[] Starts(Inputs input)=>new[]{new SharedInventoryStart(input.inventorySeed,input.inventory,"{\"note\":\"first 雪\"}"),new SharedInventoryStart(71,input.inventory,"{\"note\":\"second\"}")};
    static DurableSharedAccount Create(string file,Inputs input)
    {
        var owner=new DurableSharedAccount(file,10,20,30);
        try
        {
            var result=owner.BeginCreate(input.key,input.accountSeed,input.fields,Starts(input),"{\"opaque\":9007199254740991}");
            Need(result.State==WorkshopChangeState.Pending&&owner.Current==null&&!owner.IsReady,"Initial group published before acknowledgement");
            Need(Finish(owner).State==WorkshopChangeState.Committed&&owner.IsReady,"Initial group failed");return owner;
        }
        catch{owner.Dispose();throw;}
    }
    static void Pair(SlotStore peer,SharedAccountSnapshot view)
    {
        var group=peer.ReadGroup(10,20,30);Need(group.Result.Succeeded,"Read group failed");
        for(int i=0;i<3;i++)
        {
            var row=i==0?view.Account:view.Inventories[i-1];var saved=group.Records[i];
            Need(row.Revision==saved.Revision&&row.Json==saved.CraftingJson&&row.ExtraJson==saved.StashJson,"Disk differs from complete published group");
        }
    }
    static void Capture(string stage,string name,SharedAccountSnapshot view)
    {
        File.WriteAllText(Path.Combine(Work,stage+"-"+name+"-account.json"),view.Account.Json);
        for(int i=0;i<view.Inventories.Count;i++)File.WriteAllText(Path.Combine(Work,stage+"-"+name+"-inventory"+i+".json"),view.Inventories[i].Json);
    }
    static void Pending(DurableSharedAccount owner,SharedAccountAction[] actions)
    {
        var before=owner.Current;var reply=owner.Submit(actions,_=>true);
        Need(reply.State==WorkshopChangeState.Pending&&reply.RepliesJson==null&&ReferenceEquals(before,owner.Current),"Published a provisional group");
        Need(owner.Submit(actions,_=>true).Reason=="save-pending","Overlapping group admitted");
    }
    public static void Run(string stage)
    {
        var input=JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(Work,"inputs.json")));
        var file=Path.Combine(Work,stage+".db");var result=new Result {stage=stage,unity=Application.unityVersion};
        var owner=Create(file,input);var peer=new SlotStore();
        try
        {
            Need(peer.Open(file).Succeeded,"Open peer");Pair(peer,owner.Current);Capture(stage,"initial",owner.Current);
            var before=owner.Current;
            var refused=owner.Submit(new[]{new SharedAccountAction(-1,input.locked),new SharedAccountAction(0,input.salvage)},
                text=>JsonUtility.FromJson<Replies>("{\"rows\":"+text+"}").rows[0].reply.result);
            Need(refused.Reason=="gameplay-policy-refused"&&ReferenceEquals(before,owner.Current),"Refused gameplay result published salvage");Pair(peer,before);result.policyRollback=true;
            bool thrown=false;
            try { owner.Submit(Batch(input),text=>{Need(owner.Submit(Batch(input),_=>true).Reason=="save-pending","Policy reentered owner");throw new ApplicationException("policy probe");}); }
            catch(ApplicationException error){Need(error.Message=="policy probe","Unexpected policy exception");thrown=true;}
            Need(thrown&&ReferenceEquals(before,owner.Current)&&!owner.IsBusy,"Policy exception left a proposal");Pair(peer,before);result.exceptionRollback=true;
            refused=owner.Submit(new[]{new SharedAccountAction(-1,input.memory),new SharedAccountAction(0,input.invalid)},_=>true);
            Need(refused.State==WorkshopChangeState.Refused&&ReferenceEquals(before,owner.Current)&&!owner.IsBusy,"Invalid later action retained earlier change");Pair(peer,before);result.invalidRollback=true;
            Pending(owner,Batch(input));Need(Finish(owner).State==WorkshopChangeState.Committed,"Shared batch commit failed");
            Pair(peer,owner.Current);Capture(stage,"batch",owner.Current);before=owner.Current;
            // Only the account changes next. A competing write to an unchanged
            // inventory must still make the full guarded group stale.
            var changed=peer.Stage(30,before.Inventories[1].Revision,before.Inventories[1].Json,before.Inventories[1].ExtraJson+" ");
            Need(changed.Succeeded&&peer.Commit(changed.Value).Succeeded,"Competing unchanged dependency write");
            var memory=new[]{new SharedAccountAction(-1,input.memory)};Pending(owner,memory);
            var complete=Finish(owner);Need(complete.StorageStatus==SaveStatus.StaleRevision&&ReferenceEquals(before,owner.Current),"Unchanged dependency was not guarded");
            var stale=peer.ReadGroup(10,20,30);Need(stale.Records[0].Revision==before.Account.Revision&&stale.Records[1].Revision==before.Inventories[0].Revision&&stale.Records[2].Revision==before.Inventories[1].Revision+1,"Stale group wrote a prefix");result.staleDependency=true;
            result.peak=owner.ReadMetrics().PeakBytes;owner.Dispose();Need(owner.ReadMetrics().LiveBytes==0&&owner.ReadMetrics().LiveBlocks==0,"Retired owner leaked");
            owner=new DurableSharedAccount(file,10,20,30);Pair(peer,owner.Current);result.reopened=true;
            Pending(owner,memory);Need(Finish(owner).State==WorkshopChangeState.Committed,"Reopened continuation failed");Capture(stage,"continued",owner.Current);Pair(peer,owner.Current);before=owner.Current;
            var held=peer.Stage(30,before.Inventories[1].Revision,before.Inventories[1].Json,before.Inventories[1].ExtraJson);Need(held.Succeeded,"Competing writer lock");
            Pending(owner,memory);complete=Finish(owner);Need(complete.StorageStatus==SaveStatus.Busy&&ReferenceEquals(before,owner.Current),"Busy save published");Need(peer.Cancel(held.Value).Succeeded,"Release writer lock");Pair(peer,before);result.busy=true;
            Pending(owner,memory);var cancellation=owner.CancelPending();complete=Finish(owner);
            Need(cancellation.Status==SaveStatus.Ok||cancellation.Status==SaveStatus.TooLate,"Unexpected cancellation status");
            Need(complete.State==WorkshopChangeState.Committed||complete.StorageStatus==SaveStatus.Cancelled,"Cancellation did not settle");
            if(complete.StorageStatus==SaveStatus.Cancelled)Need(ReferenceEquals(before,owner.Current),"Cancelled group published");
            Pair(peer,owner.Current);Capture(stage,"final",owner.Current);result.cancellation=complete.State==WorkshopChangeState.Committed?"committed":"cancelled";
            result.peak=Math.Max(result.peak,owner.ReadMetrics().PeakBytes);owner.Dispose();result.closed=owner.ReadMetrics().LiveBytes==0&&owner.ReadMetrics().LiveBlocks==0;Need(result.closed,"Shared owner leaked");
            PublicationFailure(stage,input);result.publicationFailureClosed=true;
            Incomplete(stage,input);result.incompleteGroupRefused=true;
            result.passed=true;File.WriteAllText(Path.Combine(Work,stage+"-result.json"),JsonUtility.ToJson(result));
        }
        finally{owner.Dispose();peer.Dispose();}
    }
    static void PublicationFailure(string stage,Inputs input)
    {
        var file=Path.Combine(Work,stage+"-publication.db");var owner=Create(file,input);
        try
        {
            var before=owner.Current;Pending(owner,Batch(input));
            var native=(SharedAccountWorkshop)typeof(DurableSharedAccount).GetField("owner",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(owner);native.Dispose();
            bool failed=false;try{Finish(owner);}catch(IOException){failed=true;}
            Need(failed&&owner.IsDisposed&&ReferenceEquals(before,owner.Current),"Post-commit failure retained a usable owner");
            var storage=(UnitySaveStore)typeof(DurableSharedAccount).GetField("storage",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(owner);
            Need(storage.IsDisposed,"Post-commit failure left the storage worker open");
        }
        finally{owner.Dispose();}
        using(var restored=new DurableSharedAccount(file,10,20,30))Capture(stage,"recovered",restored.Current);
    }
    static void Incomplete(string stage,Inputs input)
    {
        var file=Path.Combine(Work,stage+"-incomplete.db");
        using(var owner=new DurableSharedAccount(file,10,20,30))
        using(var peer=new SlotStore())
        {
            Need(peer.Open(file).Succeeded,"Incomplete peer open");var staged=peer.Stage(30,0,"{}","{}");Need(staged.Succeeded&&peer.Commit(staged.Value).Succeeded,"Last-record conflicting insert");
            Need(owner.BeginCreate(input.key,input.accountSeed,input.fields,Starts(input)).State==WorkshopChangeState.Pending,"Initial stale submission");
            Need(Finish(owner).StorageStatus==SaveStatus.StaleRevision&&owner.Current==null&&!owner.IsBusy,"Initial stale group published");
            var group=peer.ReadGroup(10,20,30);Need(group.Records[0].IsEmpty&&group.Records[1].IsEmpty&&group.Records[2].Revision==1,"Initial stale group inserted a prefix");
        }
        bool refused=false;try{using(var invalid=new DurableSharedAccount(file,10,20,30)){} }catch(IOException){refused=true;}
        Need(refused,"Incomplete group admitted");
    }
    static DurableSharedAccount lifecycleOwner;
    static SlotStore lifecyclePeer;
    static SharedAccountSnapshot lifecycleBefore;
    static ulong lifecycleHeld;
    [Serializable] public class LifecycleResult { public bool passed,closed;public string stage; }
    public static void StartLifecycle(string stage)
    {
        Need(lifecycleOwner==null,"Previous shared lifecycle owner retained");
        var input=JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(Work,"inputs.json")));
        var file=Path.Combine(Work,stage+".db");lifecycleOwner=Create(file,input);lifecycleBefore=lifecycleOwner.Current;
        lifecyclePeer=new SlotStore();Need(lifecyclePeer.Open(file).Succeeded,"Shared lifecycle peer");
        var row=lifecycleBefore.Inventories[1];var held=lifecyclePeer.Stage(row.Slot,row.Revision,row.Json,row.ExtraJson);
        Need(held.Succeeded,"Shared lifecycle writer hold");lifecycleHeld=held.Value;
        Pending(lifecycleOwner,Batch(input));
    }
    public static void EndLifecycle(string stage)
    {
        try
        {
            Need(lifecycleOwner.IsDisposed&&!lifecycleOwner.IsBusy,"Lifecycle retained shared owner or proposal");
            var metrics=lifecycleOwner.ReadMetrics();Need(metrics.LiveBytes==0&&metrics.LiveBlocks==0,"Lifecycle retained shared gameplay allocations");
            var storage=(UnitySaveStore)typeof(DurableSharedAccount).GetField("storage",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(lifecycleOwner);
            Need(storage.IsDisposed,"Lifecycle retained shared storage worker");
            Need(ReferenceEquals(lifecycleBefore,lifecycleOwner.Current),"Lifecycle published unobserved shared candidates");
            Need(lifecyclePeer.Cancel(lifecycleHeld).Succeeded,"Shared lifecycle writer release");Pair(lifecyclePeer,lifecycleBefore);
            File.WriteAllText(Path.Combine(Work,stage+"-lifecycle.json"),JsonUtility.ToJson(new LifecycleResult {passed=true,closed=true,stage=stage}));
        }
        finally { lifecyclePeer?.Dispose();lifecycleOwner?.Dispose();lifecyclePeer=null;lifecycleOwner=null;lifecycleBefore=null; }
    }
    void Start(){try{Run("player");Application.Quit(0);}catch(Exception error){UnityEngine.Debug.LogException(error);Application.Quit(1);}}
}
