using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using HollowWake.Gameplay;
using HollowWake.Storage;
using UnityEngine;
public sealed class SharedEquipmentReplay : MonoBehaviour
{
    [Serializable] class Inputs { public string config,state; }
    [Serializable] class Stats { public double mana,life; }
    [Serializable] class View { public Stats stats;public double mana,life; }
    [Serializable] class Result { public bool passed,closed,busy,stale,unsupported,publicationFailureClosed,bindings,accountOnlyNoCombatWork,reopened,equipmentReads;public string stage,unity;public ulong sharedPeak,combatPeak; }
    public static string Work=>Environment.GetEnvironmentVariable("HWE_SHARED_EQUIPMENT_WORK");
    public static void Need(bool value,string message){if(!value)throw new Exception(message);}
    static Inputs Input()=>JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(Work,"inputs.json")));
    static void Write(string file,string text)=>File.WriteAllText(Path.Combine(Work,file),text);
    static View Read(CombatWorld.Actor actor)=>JsonUtility.FromJson<View>(actor.EquipmentView());
    static string Equip(long uid)=>"{\"op\":\"equip\",\"uid\":"+uid+",\"slot\":\"ring1\",\"actorLevel\":1}";
    static string Remove(long uid)=>"{\"op\":\"unequip\",\"uid\":"+uid+",\"slot\":\"ring1\",\"x\":7,\"y\":9}";
    static SharedAccountAction[] EquipBoth()=>new[]{new SharedAccountAction(0,Equip(4294967297)),new SharedAccountAction(1,Equip(4294967298))};
    static SharedAccountAction[] RemoveBoth()=>new[]{new SharedAccountAction(0,Remove(4294967297)),new SharedAccountAction(1,Remove(4294967298))};
    static SharedAccountChange Finish(DurableSharedAccount owner)
    {
        var timer=Stopwatch.StartNew();for(;;){var reply=owner.Poll();if(reply.State!=WorkshopChangeState.Pending)return reply;
            Need(timer.ElapsedMilliseconds<10000,"Equipment group save timeout");Thread.Sleep(1);}
    }
    static void Pending(DurableSharedAccount owner,SharedAccountAction[] actions)
    {
        var before=owner.Current;var reply=owner.Submit(actions,_=>true);
        Need(reply.State==WorkshopChangeState.Pending&&reply.RepliesJson==null&&ReferenceEquals(before,owner.Current),"Shared equipment published before save observation");
    }
    static DurableSharedAccount Open(string file,CombatWorld.Actor a,CombatWorld.Actor b)=>new DurableSharedAccount(file,10,new uint[]{20,30},new SharedCombatBinding(0,a),new SharedCombatBinding(1,b));
    static void Initialize(DurableSharedAccount owner,Inputs input)
    {
        Need(owner.BeginCreate("shared-combat",17,"{}",new[]{new SharedInventoryStart(23,input.state),new SharedInventoryStart(71,input.state)}).State==WorkshopChangeState.Pending,"Shared equipment creation refused");
        Need(owner.Current==null&&!owner.IsReady,"Shared equipment initial publication was early");
        Need(Finish(owner).State==WorkshopChangeState.Committed,"Shared equipment initial save failed");
    }
    static void Capture(string stage,string phase,CombatWorld.Actor a,CombatWorld.Actor b)
    {Write(stage+"-"+phase+"-0.json",a.Save());Write(stage+"-"+phase+"-1.json",b.Save());}
    static void Pair(SlotStore peer,SharedAccountSnapshot view)
    {
        var saved=peer.ReadGroup(10,20,30);Need(saved.Result.Succeeded,"Shared equipment group read");
        for(int i=0;i<3;i++){var row=i==0?view.Account:view.Inventories[i-1];Need(row.Revision==saved.Records[i].Revision&&row.Json==saved.Records[i].CraftingJson&&row.ExtraJson==saved.Records[i].StashJson,"Shared equipment durable group differs");}
    }
    static void NoPendingProjection(CombatWorld.Actor a,CombatWorld.Actor b)
    {
        bool cleared=true;
        try { using(var first=a.PrepareEquipment("{}"))using(var second=b.PrepareEquipment("{}")){} }
        catch(InvalidOperationException){cleared=false;}
        Need(cleared,"Shared equipment retained an abandoned actor projection");
    }
    public static void Run(string stage)
    {
        var input=Input();var world=new CombatWorld();var a=world.CreateActor(input.config);var b=world.CreateActor(input.config);var spare=world.CreateActor(input.config);
        var file=Path.Combine(Work,stage+".db");var owner=Open(file,a,b);var peer=new SlotStore();var result=new Result {stage=stage,unity=Application.unityVersion};
        try
        {
            Initialize(owner,input);Need(peer.Open(file).Succeeded,"Equipment peer open");Pair(peer,owner.Current);
            a.Press();b.Press();a.Advance(.1);b.Advance(.1);
            Pending(owner,EquipBoth());Need(Read(a).stats.mana==117&&Read(b).stats.life==68,"Prepared gear was exposed");
            a.Advance(.1);b.Advance(.2);Capture(stage,"equip-before",a,b);
            Need(Finish(owner).State==WorkshopChangeState.Committed,"Shared equip commit failed");Capture(stage,"equip-after",a,b);Pair(peer,owner.Current);
            Need(Read(a).stats.mana==131&&Read(a).mana==109&&Read(b).stats.life==80&&Read(b).life==68,"Shared equip restored stale resources");
            var requests=world.ReadTraffic().Requests;
            Pending(owner,new[]{new SharedAccountAction(-1,"{\"op\":\"observe\",\"level\":1,\"credits\":1000,\"ledger\":{},\"roster\":[]}")});
            Need(Finish(owner).State==WorkshopChangeState.Committed,"Shared account observation failed");
            Need(world.ReadTraffic().Requests==requests,"Account-only change rebuilt combat equipment");result.accountOnlyNoCombatWork=true;
            // The first projection is valid and the second is unsupported. Both
            // must be discarded before any storage write or actor publication.
            var view=owner.Current;var beforeA=a.Save();var beforeB=b.Save();bool refused=false;
            try{owner.Submit(new[]{new SharedAccountAction(0,Remove(4294967297)),new SharedAccountAction(1,Equip(4294967300))},_=>true);}catch(InvalidOperationException){refused=true;}
            Need(refused&&!owner.IsBusy&&ReferenceEquals(view,owner.Current)&&beforeA==a.Save()&&beforeB==b.Save(),"Unsupported later actor retained an earlier projection");Pair(peer,view);NoPendingProjection(a,b);result.unsupported=true;
            Pending(owner,RemoveBoth());a.Advance(1);b.Advance(1);a.Advance(.2);b.Advance(.2);a.Press();b.Press();a.ResolveContact();b.ResolveContact();a.ApplyTimedDamage(5);b.ApplyTimedDamage(7);a.Advance(.1);b.Advance(.1);
            Capture(stage,"remove-before",a,b);Need(Finish(owner).State==WorkshopChangeState.Committed,"Shared removal commit failed");Capture(stage,"remove-after",a,b);
            Need(Read(a).stats.mana==117&&Read(a).mana==101&&Read(b).stats.life==68,"Shared removal restored old actor state");
            view=owner.Current;var row=view.Inventories[1];var held=peer.Stage(row.Slot,row.Revision,row.Json,row.ExtraJson);Need(held.Succeeded,"Equipment writer hold");
            Pending(owner,EquipBoth());a.Advance(.1);b.Advance(.1);beforeA=a.Save();beforeB=b.Save();
            Need(Finish(owner).StorageStatus==SaveStatus.Busy&&ReferenceEquals(view,owner.Current)&&beforeA==a.Save()&&beforeB==b.Save(),"Busy shared equipment changed combat");
            Need(peer.Cancel(held.Value).Succeeded,"Equipment writer release");Pair(peer,view);NoPendingProjection(a,b);result.busy=true;
            var external=peer.Stage(row.Slot,row.Revision,row.Json,row.ExtraJson);Need(external.Succeeded&&peer.Commit(external.Value).Succeeded,"Equipment external revision");
            Pending(owner,new[]{new SharedAccountAction(0,Equip(4294967297))});beforeA=a.Save();beforeB=b.Save();
            Need(Finish(owner).StorageStatus==SaveStatus.StaleRevision&&ReferenceEquals(view,owner.Current)&&beforeA==a.Save()&&beforeB==b.Save(),"Stale dependency published linked gear");NoPendingProjection(a,b);result.stale=true;
            result.sharedPeak=owner.ReadMetrics().PeakBytes;owner.Dispose();Need(a.IsDisposed&&b.IsDisposed&&!spare.IsDisposed,"Shared owner disposed wrong actors");
            a=world.CreateActor(input.config);b=world.CreateActor(input.config);owner=Open(file,a,b);Pair(peer,owner.Current);
            Need(Read(a).stats.mana==117&&Read(b).stats.life==68,"Reopened linked actor differs");result.reopened=true;
            view=owner.Current;Pending(owner,EquipBoth());b.Dispose();bool stopped=false;
            try{Finish(owner);}catch(IOException error){stopped=error.Message.Contains("committed");}
            Need(stopped&&owner.IsDisposed&&a.IsDisposed&&b.IsDisposed&&ReferenceEquals(view,owner.Current),"Post-commit shared equipment failure left a live actor");result.publicationFailureClosed=true;
            using(var nextA=world.CreateActor(input.config))using(var nextB=world.CreateActor(input.config))using(var restored=Open(file,nextA,nextB))
            {
                Need(Read(nextA).stats.mana==131&&Read(nextA).mana==117&&Read(nextB).stats.life==80&&Read(nextB).life==68,"Acknowledged shared gear was lost on recovery");Pair(peer,restored.Current);
                Write(stage+"-final-account.json",restored.Current.Account.Json);for(int i=0;i<2;i++)Write(stage+"-final-inventory"+i+".json",restored.Current.Inventories[i].Json);
                result.sharedPeak=Math.Max(result.sharedPeak,restored.ReadMetrics().PeakBytes);
            }
            using(var first=world.CreateActor(input.config))using(var second=world.CreateActor(input.config))
            {
                foreach(var bindings in new[]{new[]{new SharedCombatBinding(0,first),new SharedCombatBinding(0,second)},new[]{new SharedCombatBinding(0,first),new SharedCombatBinding(1,first)}})
                {
                    bool invalid=false;try{using(var failed=new DurableSharedAccount(file,10,new uint[]{20,30},bindings)){} }catch(ArgumentException){invalid=true;}
                    Need(invalid&&!first.IsDisposed&&!second.IsDisposed,"Invalid bindings transferred actor ownership");
                }
            }
            result.bindings=true;result.combatPeak=world.ReadMetrics().PeakBytes;
        }
        finally{owner.Dispose();peer.Dispose();world.Dispose();}
        Need(owner.ReadMetrics().LiveBytes==0&&owner.ReadMetrics().LiveBlocks==0&&world.ReadMetrics().LiveBytes==0&&world.ReadMetrics().LiveBlocks==0,"Shared equipment retained native allocations");
        EquipmentReads(input);result.equipmentReads=true;
        result.closed=result.passed=true;Write(stage+"-result.json",JsonUtility.ToJson(result));
    }
    static void EquipmentReads(Inputs input)
    {
        var host=SharedAccountWorkshop.Open();var other=SharedAccountWorkshop.Open();
        try
        {
            using(var account=host.OpenAccount(1,"read-owner",17))using(var foreign=other.OpenAccount(1,"foreign-owner",17))
            using(var inventory=account.OpenInventory(1,23,input.state))using(var foreignInventory=foreign.OpenInventory(1,23,input.state))
            {
                using(var change=host.Prepare(inventory.Command(Equip(4294967297))))
                {
                    Need(inventory.EquipmentJson()=="{}","Typed read exposed candidate equipment");
                    var before=host.ReadTraffic();string candidate=change.EquipmentJson(inventory);var after=host.ReadTraffic();
                    Need(candidate.Contains("4294967297")&&after.Requests==before.Requests+1&&after.ResponseBytes-before.ResponseBytes<1000,"Typed candidate read copied unrelated inventory data");
                    bool refused=false;before=host.ReadTraffic();try{change.EquipmentJson(foreignInventory);}catch(ArgumentException){refused=true;}
                    Need(refused&&host.ReadTraffic().Requests==before.Requests,"Foreign inventory reached prepared equipment");
                    change.Commit();Need(inventory.EquipmentJson()==candidate,"Typed equipment commit differs");
                    refused=false;try{change.EquipmentJson(inventory);}catch(ObjectDisposedException){refused=true;}Need(refused,"Retired proposal still reads equipment");
                }
                using(var unchanged=host.Prepare(account.Command("{\"op\":\"catalogue\",\"offset\":0,\"limit\":1}")))
                {bool refused=false;try{unchanged.EquipmentJson(inventory);}catch(InvalidOperationException){refused=true;}Need(refused,"Unchanged proposal invented candidate state");}
                inventory.Dispose();using(var replacement=account.OpenInventory(1,23,input.state))
                {bool refused=false;try{inventory.EquipmentJson();}catch(ObjectDisposedException){refused=true;}Need(refused&&replacement.EquipmentJson()=="{}","Retired inventory read a replacement");}
            }
        }
        finally{host.Dispose();other.Dispose();}
        Need(host.ReadMetrics().LiveBytes==0&&host.ReadMetrics().LiveBlocks==0&&other.ReadMetrics().LiveBytes==0&&other.ReadMetrics().LiveBlocks==0,"Typed equipment read owners leaked");
    }
    // The fault runner injects a throw after publishing the first actor and
    // before the second. This course must observe committed disk state and
    // complete retirement, rather than misreporting the save as rolled back.
    public static void PublicationFailure()
    {
        var input=Input();var world=new CombatWorld();var a=world.CreateActor(input.config);var b=world.CreateActor(input.config);var spare=world.CreateActor(input.config);
        var file=Path.Combine(Work,"publication-failure.db");var owner=Open(file,a,b);
        try
        {
            Initialize(owner,input);var before=owner.Current;Pending(owner,EquipBoth());bool failed=false;
            try{Finish(owner);}catch(IOException error){failed=error.Message.Contains("committed")&&error.ToString().Contains("Injected second equipment publication");}
            Need(failed&&owner.IsDisposed&&!owner.IsBusy&&a.IsDisposed&&b.IsDisposed&&!spare.IsDisposed&&ReferenceEquals(before,owner.Current),"Partial equipment publication failed to retire every bound actor");
            Need(owner.ReadMetrics().LiveBytes==0&&owner.ReadMetrics().LiveBlocks==0,"Partial publication retained the shared runtime");
            using(var recovered=new DurableSharedAccount(file,10,20,30))using(var peer=new SlotStore())
            {
                Need(peer.Open(file).Succeeded,"Partial publication recovery open");Pair(peer,recovered.Current);
                Need(recovered.Current.Account.Revision==2&&recovered.Current.Inventories[0].Json.Contains("4294967297")&&recovered.Current.Inventories[1].Json.Contains("4294967298"),"Partial publication lost acknowledged records");
                Write("publication-failure-final-account.json",recovered.Current.Account.Json);
                for(int i=0;i<2;i++)Write("publication-failure-final-inventory"+i+".json",recovered.Current.Inventories[i].Json);
                var row=recovered.Current.Account;var held=peer.Stage(row.Slot,row.Revision,row.Json,row.ExtraJson);
                Need(held.Succeeded&&peer.Cancel(held.Value).Succeeded,"Partial publication retained the storage worker lock");
            }
        }
        finally{owner.Dispose();world.Dispose();}
        Need(world.ReadMetrics().LiveBytes==0&&world.ReadMetrics().LiveBlocks==0,"Partial publication retained the combat runtime");
        Write("publication-failure-result.json",JsonUtility.ToJson(new LifecycleResult {passed=true,closed=true,stage="publication-failure"}));
    }
    static DurableSharedAccount lifecycleOwner;static CombatWorld lifecycleWorld;static CombatWorld.Actor lifecycleA,lifecycleB;
    static SlotStore lifecyclePeer;static SharedAccountSnapshot lifecycleBefore;static ulong lifecycleHeld;
    [Serializable] public class LifecycleResult { public bool passed,closed;public string stage; }
    public static void StartLifecycle(string stage)
    {
        Need(lifecycleOwner==null,"Previous shared equipment lifecycle retained");var input=Input();var file=Path.Combine(Work,stage+".db");
        lifecycleWorld=new CombatWorld();lifecycleA=lifecycleWorld.CreateActor(input.config);lifecycleB=lifecycleWorld.CreateActor(input.config);
        lifecycleOwner=Open(file,lifecycleA,lifecycleB);Initialize(lifecycleOwner,input);lifecycleBefore=lifecycleOwner.Current;
        lifecyclePeer=new SlotStore();Need(lifecyclePeer.Open(file).Succeeded,"Shared equipment lifecycle peer");
        var row=lifecycleBefore.Inventories[1];var held=lifecyclePeer.Stage(row.Slot,row.Revision,row.Json,row.ExtraJson);Need(held.Succeeded,"Shared equipment lifecycle lock");lifecycleHeld=held.Value;
        Write(stage+"-initial-account.json",lifecycleBefore.Account.Json);for(int i=0;i<2;i++)Write(stage+"-initial-inventory"+i+".json",lifecycleBefore.Inventories[i].Json);
        Pending(lifecycleOwner,EquipBoth());
    }
    public static void EndLifecycle(string stage)
    {
        try
        {
            Need(lifecycleOwner.IsDisposed&&!lifecycleOwner.IsBusy&&lifecycleA.IsDisposed&&lifecycleB.IsDisposed,"Lifecycle retained shared equipment actors or proposal");
            Need(lifecycleOwner.ReadMetrics().LiveBytes==0&&lifecycleOwner.ReadMetrics().LiveBlocks==0,"Lifecycle retained shared equipment allocations");
            // The coordinator owns its bound actors, not the shared combat
            // world. Entering play without a domain reload leaves that host
            // available to other actors; its owner still releases the world.
            if(stage.StartsWith("play-entry-"))
                using(var independent=lifecycleWorld.CreateActor(Input().config))Need(Read(independent).stats.mana==117,"Shared coordinator closed the host-owned combat world");
            lifecycleWorld.Dispose();
            Need(lifecycleWorld.ReadMetrics().LiveBytes==0&&lifecycleWorld.ReadMetrics().LiveBlocks==0,"Disposed lifecycle combat world retained allocations");
            Need(ReferenceEquals(lifecycleBefore,lifecycleOwner.Current),"Lifecycle published shared equipment candidates");
            Need(lifecyclePeer.Cancel(lifecycleHeld).Succeeded,"Shared equipment lifecycle unlock");Pair(lifecyclePeer,lifecycleBefore);
            Write(stage+"-lifecycle.json",JsonUtility.ToJson(new LifecycleResult {passed=true,closed=true,stage=stage}));
        }
        finally{lifecyclePeer?.Dispose();lifecycleOwner?.Dispose();lifecycleWorld?.Dispose();lifecyclePeer=null;lifecycleOwner=null;lifecycleWorld=null;lifecycleA=lifecycleB=null;lifecycleBefore=null;}
    }
    void Start(){try{Run("player");Application.Quit(0);}catch(Exception error){UnityEngine.Debug.LogException(error);Application.Quit(1);}}
}
