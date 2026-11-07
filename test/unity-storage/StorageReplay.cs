using System;
using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using HollowWake.Storage;
using UnityEngine;
using Debug = UnityEngine.Debug;

public sealed class StorageReplay : MonoBehaviour
{
    public static Action<string> WorkshopContracts;
    public static Action<string> WorkshopLifecycleStart,WorkshopLifecycleEnd;
    [Serializable] public class Result
    {
        public string run, stage, unity, platform;
        public bool passed, paired, stale, rollback, asyncOwnership, exactText, bounds, disposal, closed;
        public long revision;
    }
    public static string Work => Environment.GetEnvironmentVariable("HWE_STORAGE_WORK")
        ?? throw new InvalidOperationException("Missing isolated storage course");
    public static string Body => File.ReadAllText(Path.Combine(Work,"profile.txt"),Encoding.UTF8);
    public static string Stash => File.ReadAllText(Path.Combine(Work,"stash.txt"),Encoding.UTF8);
    static UnitySaveStore held;
    public static void Need(bool condition,string message) { if(!condition)throw new Exception(message); }
    public static Result NewResult(string stage) => new Result {
        run=Environment.GetEnvironmentVariable("HWE_STORAGE_RUN"),stage=stage,
        unity=Application.unityVersion,platform=Application.platform.ToString()
    };
    public static void Write(Result result)
    {
        File.WriteAllText(Path.Combine(Work,result.stage+".json"),JsonUtility.ToJson(result,true),new UTF8Encoding(false));
    }
    public static SaveResult Finish(SlotStore store,ulong ticket)
    {
        var timer=Stopwatch.StartNew();
        for(;;)
        {
            var reply=store.Poll(ticket);
            if(reply.Status!=SaveStatus.Pending)return reply;
            Need(timer.ElapsedMilliseconds<10000,"Save completion timed out");
            Thread.Sleep(1);
        }
    }
    public static UnitySaveStore Open(string name)
    {
        var owner=new UnitySaveStore();
        try { Need(owner.Store.Open(Path.Combine(Work,name)).Succeeded,"Opening "+name);return owner; }
        catch { owner.Dispose();throw; }
    }
    public static void Exact(SaveRecord record,ulong revision,string body,string stash)
    {
        Need(record.Result.Succeeded && record.Revision==revision &&
            record.CraftingJson==body && record.StashJson==stash,"Committed pair differs");
    }
    public static Result Contracts(string stage)
    {
        var result=NewResult(stage);
        var owner=Open(stage+"-contracts.db");
        try
        {
            var store=owner.Store;
            using(var peer=Open(stage+"-contracts.db"))
            {
                Need(store.Read(1).IsEmpty,"New slot is not empty");
                var request=store.Submit(1,0,Body,Stash);
                Need(request.Succeeded && request.Value>0,"First submit");
                Need(store.Submit(1,0,"wrong","wrong").Status==SaveStatus.Unavailable,"Overlapping submit admitted");
                Need(store.Poll(request.Value+1).Status==SaveStatus.InvalidTicket,"Wrong ticket consumed completion");
                Need(Finish(store,request.Value).Succeeded && !store.IsSaving,"Background save did not complete");
                Need(store.Poll(request.Value).Status==SaveStatus.InvalidTicket,"Completion consumed twice");
                Exact(peer.Store.Read(1),1,Body,Stash);
                Need(peer.Store.Stage(1,0,"stale","stale").Status==SaveStatus.StaleRevision,"Stale writer admitted");
                var pending=store.Stage(1,1,Body+" ",Stash+"\n");
                Need(pending.Succeeded,"Staging replacement");
                Exact(peer.Store.Read(1),1,Body,Stash);
                Need(store.Cancel(pending.Value).Succeeded,"Cancel staged replacement");
                Exact(store.Read(1),1,Body,Stash);
                request=store.Submit(1,1,Body+" ",Stash+"\n");
                Need(request.Succeeded && Finish(store,request.Value).Succeeded,"Replacement submit");
                Exact(peer.Store.Read(1),2,Body+" ",Stash+"\n");
                Need(store.Stage(3,0,new string('x',SlotStore.DocumentLimit+1),"[]").Status==SaveStatus.PayloadSize,"Oversized document admitted");
                var maximum=new string('x',SlotStore.DocumentLimit);
                pending=store.Stage(3,0,maximum,"[]");
                Need(pending.Succeeded && store.Commit(pending.Value).Succeeded,"Maximum document refused");
                Exact(store.Read(3),1,maximum,"[]");
                request=store.Submit(2,0,Body,Stash);
                Need(request.Succeeded,"Cancellation submission");
                var cancel=store.CancelAsync(request.Value);
                var complete=Finish(store,request.Value);
                if(cancel.Succeeded)
                    Need(complete.Status==SaveStatus.Cancelled && store.Read(2).IsEmpty,"Cancelled save changed its slot");
                else
                {
                    Need(cancel.Status==SaveStatus.TooLate && complete.Succeeded,"Late cancellation hid outcome");
                    Exact(store.Read(2),1,Body,Stash);
                }
                Need(store.Checkpoint().Result.Succeeded,"Checkpoint failed");
                Need(store.Close().Succeeded,"Close failed");
                Need(store.Open(Path.Combine(Work,stage+"-contracts.db"),SaveJournal.Preserve).Succeeded,"Reopen failed");
                Exact(store.Read(1),2,Body+" ",Stash+"\n");
            }
            result.paired=result.stale=result.rollback=result.asyncOwnership=result.exactText=result.bounds=true;
            result.revision=2;
        }
        finally { owner.Dispose(); }
        Need(owner.IsDisposed,"Owner did not close");
        try { owner.Store.Read(1); } catch(ObjectDisposedException) { result.disposal=true; }
        Need(result.disposal,"Retired store still callable");
        result.passed=true;
        Write(result);
        return result;
    }
    bool RunPlayer(string mode)
    {
        if(mode=="contracts")
        {
            Contracts("player");
            WorkshopContracts?.Invoke("player");
            using(var seed=Open("recovery.db"))
            {
                var request=seed.Store.Submit(1,0,Body,Stash);
                Need(request.Succeeded && Finish(seed.Store,request.Value).Succeeded,"Seeding restart database");
            }
            held=Open("quit.db");
            Need(held.Store.Stage(1,0,Body,Stash).Succeeded,"Staging quit transaction");
            WorkshopLifecycleStart?.Invoke("quit");
            Application.quitting+=()=>{
                WorkshopLifecycleEnd?.Invoke("quit");
                var closed=NewResult("quit-cleanup");closed.passed=closed.closed=held.IsDisposed;Write(closed);
            };
            return false;
        }
        if(mode=="interrupt")
        {
            held=Open("recovery.db");
            Exact(held.Store.Read(1),1,Body,Stash);
            Need(held.Store.Stage(1,1,"uncommitted","uncommitted").Succeeded,"Interrupted transaction was not staged");
            var ready=NewResult("interrupt-ready");ready.passed=true;ready.revision=1;Write(ready);
            return true;
        }
        using(var restored=Open("recovery.db"))
        {
            if(mode=="recover")
            {
                Exact(restored.Store.Read(1),1,Body,Stash);
                var request=restored.Store.Submit(1,1,Body+" ",Stash+"\n");
                Need(request.Succeeded && Finish(restored.Store,request.Value).Succeeded,"Recovery continuation");
            }
            else Need(mode=="confirm","Unknown player course");
            Exact(restored.Store.Read(1),2,Body+" ",Stash+"\n");
        }
        var result=NewResult(mode);result.passed=result.exactText=true;result.revision=2;Write(result);
        return false;
    }
    IEnumerator Start()
    {
        if(Application.isEditor)yield break;
        yield return null;
        bool wait=false,failed=false;
        try { wait=RunPlayer(Environment.GetEnvironmentVariable("HWE_STORAGE_MODE")); }
        catch(Exception error) { Debug.LogException(error);failed=true; }
        if(failed) { Application.Quit(1);yield break; }
        if(wait) { for(;;)yield return null; }
        Application.Quit(0);
    }
}
