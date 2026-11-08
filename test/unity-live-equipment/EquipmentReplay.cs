using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using HollowWake.Gameplay;
using HollowWake.Storage;
using UnityEngine;
using Debug=UnityEngine.Debug;

public sealed class EquipmentReplay : MonoBehaviour
{
    [Serializable] class Inputs { public string config, state; }
    [Serializable] class Stats { public double mana,life; }
    [Serializable] class View { public Stats stats; public double mana,life; }
    [Serializable] class Result { public bool passed,closed,publicationFailureClosed;public string stage,unity;public long revision,combatPeak,workshopPeak; }
    public static string Work=>Environment.GetEnvironmentVariable("HWE_EQUIPMENT_WORK");
    public static void Need(bool value,string message) { if(!value)throw new Exception(message); }
    static void Write(string name,string text)=>File.WriteAllText(Path.Combine(Work,name),text);
    static View Read(CombatWorld.Actor actor)=>JsonUtility.FromJson<View>(actor.EquipmentView());
    static string Equip(long uid,string slot)=>"{\"op\":\"equip\",\"uid\":"+uid+",\"slot\":\""+slot+"\",\"actorLevel\":1}";
    static string Remove=>"{\"op\":\"unequip\",\"uid\":4294967297,\"slot\":\"ring1\",\"x\":7,\"y\":9}";
    static WorkshopChange Finish(DurableWorkshop owner)
    {
        var clock=Stopwatch.StartNew();
        for(;;) { var result=owner.Poll();if(result.State!=WorkshopChangeState.Pending)return result;
            Need(clock.ElapsedMilliseconds<10000,"Save timeout");Thread.Sleep(1); }
    }
    static void Pending(DurableWorkshop owner,string command)
    {
        var before=owner.Snapshot;var revision=owner.Revision;
        Need(owner.Submit(command).State==WorkshopChangeState.Pending,"Expected pending command");
        Need(owner.Snapshot==before && owner.Revision==revision,"Inventory published before commit observation");
    }
    public static void Run(string stage)
    {
        var input=JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(Work,"inputs.json")));
        var world=new CombatWorld();var actor=world.CreateActor(input.config);
        var file=Path.Combine(Work,stage+".db");var owner=new DurableWorkshop(file,1,actor);
        var result=new Result{stage=stage,unity=Application.unityVersion};
        try
        {
            Need(owner.BeginCreate(17,input.state,"[]").State==WorkshopChangeState.Pending,"Create failed");
            Need(Finish(owner).State==WorkshopChangeState.Committed,"Initial commit failed");
            actor.Press();actor.Advance(.1);
            Pending(owner,Equip(4294967297,"ring1"));
            Need(Read(actor).stats.mana==117 && Read(actor).mana==109,"Gear published before observation");
            actor.Advance(.1);Write(stage+"-equip-before.json",actor.Save());
            Need(Finish(owner).State==WorkshopChangeState.Committed,"Equip commit failed");
            Write(stage+"-equip-after.json",actor.Save());
            Need(Read(actor).stats.mana==131 && Read(actor).mana==109,"Equip changed paid mana");
            Pending(owner,Remove);
            actor.Advance(1);actor.Advance(.2);actor.Press();actor.ResolveContact();actor.ApplyTimedDamage(5);actor.Advance(.1);
            Write(stage+"-remove-before.json",actor.Save());
            Need(Finish(owner).State==WorkshopChangeState.Committed,"Removal commit failed");
            Write(stage+"-remove-after.json",actor.Save());
            Need(Read(actor).stats.mana==117 && Read(actor).mana==101,"Removal restored stale mana");
            using(var peer=new UnitySaveStore())
            {
                Need(peer.Store.Open(file).Succeeded,"Peer open failed");
                var blocker=peer.Store.Stage(1,owner.Revision,owner.Snapshot,"[]");Need(blocker.Succeeded,"Writer lock failed");
                Pending(owner,Equip(4294967298,"ring1"));
                actor.Advance(.1);var moving=actor.Save();var before=owner.Snapshot;
                var failed=Finish(owner);
                Need(failed.State==WorkshopChangeState.Refused && failed.StorageStatus==SaveStatus.Busy,"Busy save did not refuse");
                Need(actor.Save()==moving && owner.Snapshot==before,"Busy save changed combat or inventory");
                Need(peer.Store.Cancel(blocker.Value).Succeeded,"Writer unlock failed");
                var external=peer.Store.Stage(1,owner.Revision,owner.Snapshot,"[]");
                Need(external.Succeeded && peer.Store.Commit(external.Value).Succeeded,"External revision failed");
                Pending(owner,Equip(4294967298,"ring1"));moving=actor.Save();
                failed=Finish(owner);
                Need(failed.StorageStatus==SaveStatus.StaleRevision && actor.Save()==moving && owner.Snapshot==before,"Stale save changed live state");
                Need(owner.Reload().State==WorkshopChangeState.Reloaded,"Reload failed");
                Pending(owner,Equip(4294967297,"ring1"));Need(Finish(owner).Succeeded,"Retry failed");
                var record=peer.Store.Read(1);Need(record.CraftingJson==owner.Snapshot && record.Revision==owner.Revision,"Saved pair differs");
            }
            // A saved write followed by lost live actor cannot be reported as rollback.
            Pending(owner,Remove);actor.Dispose();
            bool stopped=false;
            try { Finish(owner); }catch(IOException error) { stopped=error.Message.Contains("committed"); }
            Need(stopped && owner.IsDisposed && actor.IsDisposed,"Post-commit publication failure continued a stale actor");
            result.publicationFailureClosed=true;
            using(var replacement=world.CreateActor(input.config))
            using(var reopened=new DurableWorkshop(file,1,replacement))
            {
                Need(reopened.IsReady && Read(replacement).stats.mana==117,"Committed removal was lost on reopen");
                Pending(reopened,Equip(4294967297,"ring1"));Need(Finish(reopened).Succeeded,"Reopen continuation failed");
                Need(Read(replacement).stats.mana==131 && Read(replacement).mana==117,"Reopen gear refilled resources");
                Write(stage+"-expected.json",reopened.Snapshot);result.revision=(long)reopened.Revision;
                result.workshopPeak=(long)reopened.ReadMetrics().PeakBytes;
            }
            result.combatPeak=(long)world.ReadMetrics().PeakBytes;
        }
        finally { owner.Dispose();world.Dispose(); }
        var metrics=world.ReadMetrics();var workshop=owner.ReadMetrics();
        Need(metrics.LiveBytes==0 && metrics.LiveBlocks==0 && workshop.LiveBytes==0 && workshop.LiveBlocks==0,"Native state retained on close");
        result.closed=result.passed=true;Write(stage+"-result.json",JsonUtility.ToJson(result,true));
    }
    void Start()
    {
        if(Application.isEditor)return;
        try { Run("player");Application.Quit(0); }
        catch(Exception error) { Debug.LogException(error);Application.Quit(1); }
    }
}
