using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using HollowWake.Gameplay;
using HollowWake.Storage;
using UnityEngine;
using Debug=UnityEngine.Debug;

public sealed class DurableSampleReplay : MonoBehaviour
{
    [Serializable] public class Result
    {
        public string run,stage,unity;
        public bool passed,importedSample,committedView,busyRecovery,staleRecovery,restartContinuation;
        public long lastUid,revision;
    }
    static void Need(bool value,string reason)=>StorageReplay.Need(value,reason);
    static IEnumerator Wait(DurableInventoryWorkbench bench)
    {
        var timer=Stopwatch.StartNew();
        while(bench.IsBusy){Need(timer.ElapsedMilliseconds<10000,"Sample save timed out");yield return null;}
    }
    static void Private(DurableInventoryWorkbench bench,Action action)
    {
        var snapshot=bench.Snapshot;var uid=bench.LastUid;var revision=bench.Revision;
        action();
        Need(bench.IsBusy && bench.Snapshot==snapshot && bench.LastUid==uid && bench.Revision==revision &&
            bench.Status=="Saving…","Sample exposed a proposed inventory");
    }
    IEnumerator Course()
    {
        var mode=Environment.GetEnvironmentVariable("HWE_STORAGE_MODE");
        var result=new Result {run=Environment.GetEnvironmentVariable("HWE_STORAGE_RUN"),stage=mode,unity=Application.unityVersion};
        var bench=FindObjectOfType<DurableInventoryWorkbench>();
        Need(bench!=null && !bench.IsOpen,"Imported sample missing or wrote to a default directory");
        bench.OpenWorkshop(StorageReplay.Work);
        if(mode=="sample-create")
        {
            Need(bench.IsBusy && bench.Snapshot==null && bench.LastUid==0,"Sample initialization published early");
            yield return Wait(bench);
            using(var controlOwner=new CraftingWorkshop())
            using(var control=controlOwner.OpenProfile(1,17,DurableWorkshopReplay.Initial))
            using(var peerOwner=StorageReplay.Open("inventory.db"))
            {
                var peer=peerOwner.Store;
                control.Execute(DurableWorkshopReplay.Grant);
                Need(bench.Snapshot==control.Save() && bench.Revision==1,"Sample initialization differs");
                Private(bench,bench.ForgeHelmet);yield return Wait(bench);
                control.Execute(DurableWorkshopReplay.Forge);
                Need(bench.LastUid==1 && bench.Snapshot==control.Save(),"Sample forge differs");
                Private(bench,bench.InlayMorren);yield return Wait(bench);
                control.Execute("{\"op\":\"inlay-vestige\",\"uid\":1,\"id\":\"morren\"}");
                Need(bench.Snapshot==control.Save() && bench.Snapshot.Contains("\"sockets\":[\"morren\",null]"),"Sample inlay differs");
                var before=bench.Snapshot;var revision=bench.Revision;
                var blocker=peer.Stage(1,revision,before,"{\"version\":1,\"items\":[]}");
                Need(blocker.Succeeded,"Sample competing writer missing");
                Private(bench,bench.ForgeHelmet);yield return Wait(bench);
                Need(bench.Snapshot==before && bench.LastUid==1 && bench.Revision==revision &&
                    bench.Status.StartsWith("Save is busy."),"Failed sample save changed view");
                Need(peer.Cancel(blocker.Value).Succeeded,"Release sample competing writer");
                Private(bench,bench.ForgeHelmet);yield return Wait(bench);
                control.Execute(DurableWorkshopReplay.Forge);
                Need(bench.Snapshot==control.Save() && bench.LastUid==2,"Sample busy retry differs");
                result.busyRecovery=true;
                before=bench.Snapshot;revision=bench.Revision;
                var changed=peer.Stage(1,revision,before,"{\"version\":1,\"items\":[]}");
                Need(changed.Succeeded && peer.Commit(changed.Value).Succeeded,"Advance sample peer revision");
                Private(bench,bench.ForgeHelmet);yield return Wait(bench);
                Need(bench.Snapshot==before && bench.LastUid==2 && bench.Revision==revision &&
                    bench.Status.StartsWith("Another session saved changes."),"Sample stale writer changed view");
                bench.ReloadSaved();
                Need(bench.Snapshot==before && bench.Revision==revision+1,"Sample stale reload differs");
                Private(bench,bench.ForgeHelmet);yield return Wait(bench);
                control.Execute(DurableWorkshopReplay.Forge);
                Need(bench.Snapshot==control.Save() && bench.LastUid==3,"Sample stale retry differs");
                result.staleRecovery=result.committedView=true;
                File.WriteAllText(Path.Combine(StorageReplay.Work,"sample-current.expected"),control.Save());
                control.Execute(DurableWorkshopReplay.Forge);
                File.WriteAllText(Path.Combine(StorageReplay.Work,"sample-next.expected"),control.Save());
            }
        }
        else
        {
            Need(mode=="sample-reopen" && !bench.IsBusy && bench.LastUid==3 &&
                bench.Snapshot==File.ReadAllText(Path.Combine(StorageReplay.Work,"sample-current.expected")),"Sample restart lost inventory");
            Private(bench,bench.ForgeHelmet);yield return Wait(bench);
            Need(bench.LastUid==4 && bench.Snapshot==File.ReadAllText(Path.Combine(StorageReplay.Work,"sample-next.expected")),"Sample restart lost RNG or IDs");
            result.restartContinuation=result.committedView=true;
        }
        var screenshot=Environment.GetEnvironmentVariable("HWE_STORAGE_SCREENSHOT");
        if(!String.IsNullOrEmpty(screenshot))
        {
            yield return new WaitForEndOfFrame();
            Texture2D screen=null;
            try
            {
                screen=ScreenCapture.CaptureScreenshotAsTexture();
                Need(screen!=null && screen.width>=960 && screen.height>=600,"Sample viewport missing");
                int bright=0;foreach(var pixel in screen.GetPixels32())if(pixel.r>150 && pixel.g>150 && pixel.b>150)bright++;
                Need(bright>500,"Sample did not render its controls");
                File.WriteAllBytes(screenshot,screen.EncodeToPNG());
            }
            finally{if(screen!=null)Destroy(screen);}
        }
        result.lastUid=bench.LastUid;result.revision=(long)bench.Revision;
        bench.gameObject.SetActive(false);
        Need(!bench.IsOpen,"Disabled sample retained its workshop");
        result.passed=result.importedSample=true;
        File.WriteAllText(Path.Combine(StorageReplay.Work,mode+".json"),JsonUtility.ToJson(result,true));
    }
    IEnumerator Start()
    {
        if(Application.isEditor)yield break;
        // Flatten nested iterators so a failed async assertion closes the owned
        // player immediately instead of leaving it alive until the outer timeout.
        var pending=new Stack<IEnumerator>();pending.Push(Course());
        bool failed=false;
        try
        {
            while(pending.Count>0)
            {
                object next=null;
                try
                {
                    var step=pending.Peek();
                    if(!step.MoveNext()){(pending.Pop() as IDisposable)?.Dispose();continue;}
                    next=step.Current;
                    if(next is IEnumerator nested){pending.Push(nested);continue;}
                }
                catch(Exception error){Debug.LogException(error);failed=true;break;}
                yield return next;
            }
        }
        finally{while(pending.Count>0)(pending.Pop() as IDisposable)?.Dispose();}
        Application.Quit(failed?1:0);
    }
}
