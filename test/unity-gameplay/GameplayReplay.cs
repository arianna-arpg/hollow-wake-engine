using System;
using System.Collections;
using System.IO;
using System.Text;
using HollowWake.Gameplay;
using UnityEngine;

public sealed class GameplayReplay : MonoBehaviour
{
    [Serializable] public class Result
    {
        public string unity, platform, stage, run;
        public int combatRequests, pouchRequests, workshopRequests;
        public long combatPeak, pouchPeak, workshopPeak, liveBytes, liveBlocks;
        public double restoredHit, sampleHit;
        public bool saveContinuation, isolatedActors, refusedInvalidRestore, closedHost, duplicatePress, importedSample;
        public bool catchUpBoundary, stoppedOnDeath, typedPouch, typedWorkshop, workshopContinuation, workshopIsolation, workshopClosed, workshopSample;
        public long[] singleStepManagedBytes, catchUpManagedBytes;
        public bool managedAllocationCounterAvailable;
        public long[] singleStepMicroseconds, catchUpMicroseconds, singleNativeAllocations, catchUpNativeAllocations;
        public long singleRequests, catchUpRequests, singleWireBytes, catchUpWireBytes;
    }
    public static string Work => Environment.GetEnvironmentVariable("HWE_UNITY_COURSES")
        ?? throw new InvalidOperationException("Missing external verification course");
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    public static void Need(bool ok, string message) { if (!ok) throw new Exception(message); }
    static int Replay(GameplayHost host, string name, string stage)
    {
        int count = 0;
        using (var output = new StreamWriter(Path.Combine(Work, stage + "-" + name + ".replies"), false, Utf8))
            foreach (string line in File.ReadLines(Path.Combine(Work, name + ".requests")))
            {
                if (line.Length == 0) continue;
                output.WriteLine(host.Execute(line));
                count++;
            }
        return count;
    }
    public static Result Run(string stage)
    {
        var result = new Result { unity = Application.unityVersion, platform = Application.platform.ToString(), stage = stage,
            run=Environment.GetEnvironmentVariable("HWE_UNITY_RUN_ID") };
        var host = GameplayHost.OpenCombat();
        try
        {
            Need(host.Execute("null").Contains("invalid-request"),"Malformed combat input did not refuse");
            result.combatRequests = Replay(host, "combat", stage);
            result.combatPeak = (long)host.ReadMetrics().PeakBytes;
        }
        finally { host.Dispose(); }
        result.liveBytes += (long)host.FinalMetrics.LiveBytes;
        result.liveBlocks += (long)host.FinalMetrics.LiveBlocks;
        try { host.Execute("{}"); } catch (ObjectDisposedException) { result.closedHost = true; }
        host.Dispose();
        using (var pouches = GameplayHost.OpenMemoryPouches())
        {
            Need(pouches.Execute("null").Contains("invalid-pouch-context") && pouches.Execute("{\"op\":\"view\",\"memory\":null,\"state\":{}}").Contains("invalid-pouch-context"),"Malformed pouch inputs did not refuse");
            result.pouchRequests = Replay(pouches, "pouches", stage);
            result.pouchPeak = (long)pouches.ReadMetrics().PeakBytes;
            pouches.Dispose();
            result.liveBytes += (long)pouches.FinalMetrics.LiveBytes;
            result.liveBlocks += (long)pouches.FinalMetrics.LiveBlocks;
        }
        using(var workshop=GameplayHost.OpenWorkshop())
        {
            result.workshopRequests=Replay(workshop,"workshop",stage);
            result.workshopPeak=(long)workshop.ReadMetrics().PeakBytes;
            Need(result.workshopPeak<=32L*1024*1024,"Workshop host exceeded its memory cap");
            workshop.Dispose();
            result.liveBytes+=(long)workshop.FinalMetrics.LiveBytes;
            result.liveBlocks+=(long)workshop.FinalMetrics.LiveBlocks;
        }
        WorkshopReplay.Check(result);
        var build = Resources.Load<TextAsset>("HollowWakeSample/Magician");
        Need(build != null, "Package Manager sample build missing");
        using (var world = new CombatWorld())
        using (var actor = world.CreateActor(build.text))
        using (var independent = world.CreateActor(build.text))
        {
            string unchanged = independent.Save();
            Need(actor.Advance(0).cast==null && actor.AdvanceSteps(0,1).cast==null,"Idle frame reported a phantom cast event");
            Need(actor.Press().kind == "started", "Configured cast did not start");
            result.duplicatePress = actor.Press().reason == "busy";
            actor.Advance(.1);
            string active = actor.Save();
            try { world.RestoreActor("{\u0022version\u0022:999}"); }
            catch (InvalidOperationException) { result.refusedInvalidRestore = true; }
            using (var restored = world.RestoreActor(active))
            {
                var first = actor.Advance(2).cast;
                var second = restored.Advance(2).cast;
                Need(first.kind == "completed" && first.token == second.token && second.kind == "completed", "Cast continuation mismatch");
                var hit = actor.ResolveContact();
                var replay = restored.ResolveContact();
                Need(hit.damage > 0 && hit.damage == replay.damage, "Restored contact differs");
                result.restoredHit = hit.damage;
                Need(actor.ApplyTimedDamage(10) == "applied" && restored.ApplyTimedDamage(10) == "applied", "Burn application");
                var tick = actor.Advance(.25);
                Need(tick.raw == 2.5 && tick.damage == restored.Advance(.25).damage, "Burn tick");
                result.saveContinuation = actor.Save() == restored.Save();
                result.isolatedActors = unchanged == independent.Save();
            }
            using (var left=world.RestoreActor(active))
            using (var right=world.RestoreActor(active))
            {
                var stop=right.AdvanceSteps(1.0/30,64);
                Need(stop.steps>0 && stop.steps<64 && stop.cast.kind=="completed","Catch-up ran across a cast boundary");
                CombatWorld.Frame frame=null;
                for(int i=0;i<stop.steps;i++)frame=left.Advance(1.0/30);
                Need(frame.cast.token==stop.cast.token && left.Save()==right.Save(),"Batched cast clock or receipt changed");
                result.catchUpBoundary=true;
                MeasureSteps(world,left,right,result);
            }
            using(var left=world.CreateActor(build.text))
            using(var right=world.CreateActor(build.text))
            {
                left.ApplyTimedDamage(1000); right.ApplyTimedDamage(1000);
                var stop=right.AdvanceSteps(.1,64);
                Need(stop.steps==2 && stop.targetLife==-20,"Catch-up lost the overkill value or ran past defeat");
                var one=left.Advance(.1);var two=left.Advance(.1);
                var retired=right.AdvanceSteps(.1,64);
                result.stoppedOnDeath=retired.steps==0 && retired.targetLife==stop.targetLife && retired.cast==null &&
                    stop.raw==one.raw+two.raw && stop.damage==one.damage+two.damage && left.Save()==right.Save();
            }
        }
        const string bag="{\"board\":{\"w\":1,\"h\":1},\"account\":{\"features\":[],\"ledger\":{},\"progression\":true},\"items\":[{\"uid\":1,\"x\":0,\"y\":0,\"baseId\":\"preformed_memory\",\"mem\":[{\"d\":\"crypt_lich\",\"s\":4294967295}]}]}";
        using(var pouches=new MemoryPouches())
        {
            var preview=pouches.Inspect(bag,1,10);
            Need(preview.ok && preview.view.groups.Length==1 && preview.facets.Length==3,"Typed pouch panel");
            var group=preview.view.groups[0].key;
            Need(!pouches.Recall(bag,1,10,group,4294967301).ok,"Facet refused before mint");
            var move=pouches.Recall(bag,1,10,group,4294967301,preview.facets[0].id);
            Need(move.ok && move.nextUid==4294967302L && move.result.itemUid==4294967301L && move.result.id=="cleave" &&
                move.ledgerJson.Contains("gemdrops_total") && move.memoryJson.Contains(pouches.ContentId) &&
                move.itemsJson.Contains("4294967301"),"Typed reveal lost inventory or receipt");
            result.typedPouch=true;
        }
        Need(result.combatRequests == 60 && result.pouchRequests == 2334 && result.closedHost &&
             result.duplicatePress && result.refusedInvalidRestore && result.saveContinuation && result.isolatedActors &&
             result.liveBytes == 0 && result.liveBlocks == 0, "Incomplete Unity SDK verification");
        return result;
    }
    static void MeasureSteps(CombatWorld world,CombatWorld.Actor single,CombatWorld.Actor batch,Result result)
    {
        const int groups=8, steps=64;
        const double dt=1.0/60;
        for(int i=0;i<steps;i++)single.Advance(dt);
        batch.AdvanceSteps(dt,steps);
        result.singleStepManagedBytes=new long[4];
        result.catchUpManagedBytes=new long[4];
        result.singleStepMicroseconds=new long[4]; result.catchUpMicroseconds=new long[4];
        result.singleNativeAllocations=new long[4]; result.catchUpNativeAllocations=new long[4];
        for(int round=0;round<4;round++)
        {
            for(int turn=0;turn<2;turn++)
            {
                bool batched=(round+turn)%2==1;
                var trafficBefore=world.ReadTraffic();
                ulong allocated=world.ReadMetrics().Allocations;
                long before=GC.GetAllocatedBytesForCurrentThread();
                long start=System.Diagnostics.Stopwatch.GetTimestamp();
                if(batched)
                {
                    for(int i=0;i<groups;i++)Need(batch.AdvanceSteps(dt,steps).steps==steps,"Unexpected catch-up stop");
                }
                else for(int i=0;i<groups*steps;i++)single.Advance(dt);
                long elapsed=(System.Diagnostics.Stopwatch.GetTimestamp()-start)*1000000/System.Diagnostics.Stopwatch.Frequency;
                long bytes=GC.GetAllocatedBytesForCurrentThread()-before;
                (batched?result.catchUpManagedBytes:result.singleStepManagedBytes)[round]=bytes;
                (batched?result.catchUpMicroseconds:result.singleStepMicroseconds)[round]=elapsed;
                (batched?result.catchUpNativeAllocations:result.singleNativeAllocations)[round]=(long)(world.ReadMetrics().Allocations-allocated);
                var traffic=world.ReadTraffic();
                long requests=(long)(traffic.Requests-trafficBefore.Requests);
                long wire=(long)(traffic.RequestBytes+traffic.ResponseBytes-trafficBefore.RequestBytes-trafficBefore.ResponseBytes);
                if(batched){result.catchUpRequests=requests;result.catchUpWireBytes=wire;}
                else{result.singleRequests=requests;result.singleWireBytes=wire;}
            }
            Need(single.Save()==batch.Save(),"Catch-up changed the final simulation state");
        }
        result.managedAllocationCounterAvailable=result.singleStepManagedBytes[0]>0;
    }
    public static void Receipt(Result result)
    {
        File.WriteAllText(Path.Combine(Work,result.stage + ".json"), JsonUtility.ToJson(result,true), Utf8);
    }
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void StartPlayerVerification()
    {
        if(!Application.isEditor && !String.IsNullOrEmpty(Environment.GetEnvironmentVariable("HWE_UNITY_COURSES")))
            new GameObject("Package verification driver").AddComponent<GameplayReplay>();
    }
    IEnumerator Start()
    {
        Result result;
        GameObject sample;
        MonoBehaviour component;
        try
        {
            result = Run("player");
            var type = Type.GetType("CastingAndBurning, Assembly-CSharp", true);
            component = (MonoBehaviour)UnityEngine.Object.FindObjectOfType(type);
            Need(component!=null && component.gameObject.scene.name=="Ruin Encounter","Shipped sample scene did not load");
            sample=component.gameObject;
            sample.SendMessage("PressCast", SendMessageOptions.RequireReceiver);
        }
        catch (Exception failure) { Debug.LogException(failure); Application.Quit(1); yield break; }
        for (int i = 0; i < 180; i++)
        {
            yield return new WaitForFixedUpdate();
            if ((double)component.GetType().GetField("lastHit").GetValue(component) > 0) break;
        }
        try
        {
            result.sampleHit = (double)component.GetType().GetField("lastHit").GetValue(component);
            Need(result.sampleHit > 0 && (string)component.GetType().GetField("lastCast").GetValue(component) == "completed", "Imported sample did not resolve a cast");
            var bench=sample.GetComponent("InventoryWorkbench");
            Need(bench!=null,"Workshop sample missing from imported scene");
            var benchType=bench.GetType();
            benchType.GetMethod("ForgeHelmet").Invoke(bench,null);
            Need((long)benchType.GetField("lastUid").GetValue(bench)==1,"Sample forge did not create an item");
            benchType.GetMethod("InlayMorren").Invoke(bench,null);
            benchType.GetMethod("CaptureCheckpoint").Invoke(bench,null);
            var kept=(string)benchType.GetField("savedSnapshot").GetValue(bench);
            Need(kept.Contains("\"sockets\":[\"morren\",null]"),"Sample inlay did not persist");
            benchType.GetMethod("ForgeHelmet").Invoke(bench,null);
            Need((long)benchType.GetField("lastUid").GetValue(bench)==2,"Sample did not advance its item IDs");
            benchType.GetMethod("RestoreCheckpoint").Invoke(bench,null);
            Need(kept==(string)benchType.GetMethod("CurrentSnapshot").Invoke(bench,null),"Sample checkpoint did not restore");
            result.workshopSample=true;
        }
        catch (Exception failure) { Debug.LogException(failure); Application.Quit(1); yield break; }
        var capture=Environment.GetEnvironmentVariable("HWE_UNITY_SCREENSHOT");
        if(!String.IsNullOrEmpty(capture))
        {
            yield return new WaitForEndOfFrame();
            Texture2D screen=null;
            try
            {
                screen=ScreenCapture.CaptureScreenshotAsTexture();
                Need(screen!=null&&screen.width>=960&&screen.height>=600,"Rendered sample viewport missing");
                int bright=0;
                foreach(var pixel in screen.GetPixels32())
                    if(pixel.r>150&&pixel.g>150&&pixel.b>150)bright++;
                Need(bright>500,"Rendered sample did not display its text and controls");
                File.WriteAllBytes(capture,screen.EncodeToPNG());
            }
            catch (Exception failure) { Debug.LogException(failure); Application.Quit(1); yield break; }
            finally{if(screen!=null)Destroy(screen);}
        }
        try
        {
            sample.SetActive(false);
            result.importedSample = true;
            Receipt(result);
            Application.Quit(0);
        }
        catch (Exception failure) { Debug.LogException(failure); Application.Quit(1); }
    }
}
