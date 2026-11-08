using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using HollowWake.Gameplay;
using UnityEngine;

public sealed class SharedAccountReplay : MonoBehaviour
{
    [Serializable] class Operation { public string op,text,key,kind;public uint account,profile,seed,handle;public bool progression;public long nextUid,token;public Operation[] commands;public bool throws; }
    [Serializable] class Inputs { public Operation[] steps; }
    [Serializable] class Saved { public string text;public long version,accountVersion; }
    [Serializable] class Write { public string kind;public uint handle; }
    [Serializable] class Prepared { public string text;public bool hasChanges;public Write[] writes; }
    [Serializable] class Result { public bool passed,closed,retiredAccount,retiredInventory,retiredCommand,ownerDisposal,foreignOwner,documentationExample;public string stage,unity;public int steps;public ulong peak,requests; }
    [Serializable] class AccountSaveView { public ProgressionView progression; }
    [Serializable] class ProgressionView { public AccountView account; }
    [Serializable] class AccountView { public long credits; }
    [Serializable] class Mutation { public bool ok;public Purchase reply; }
    [Serializable] class Purchase { public bool ok,result; }
    public static string Work=>Environment.GetEnvironmentVariable("HWE_SHARED_ACCOUNT_WORK");
    public static void Need(bool condition,string message){if(!condition)throw new Exception(message);}
    static void Refuses(Action action,string message)
    { try{action();}catch(ObjectDisposedException){return;}throw new Exception(message); }
    static string Save(SharedAccountWorkshop.SavedRecord saved)=>JsonUtility.ToJson(new Saved {text=saved.Json,version=saved.Version,accountVersion=saved.AccountVersion});
    public static void Run(string stage)
    {
        var input=JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(Work,"inputs.json")));
        var host=SharedAccountWorkshop.Open(32);
        var accounts=new Dictionary<uint,SharedAccountWorkshop.Account>();var inventories=new Dictionary<uint,SharedAccountWorkshop.Inventory>();
        var prepared=new Dictionary<long,SharedAccountWorkshop.PreparedChange>();
        Func<Operation,SharedAccountWorkshop.Command> command=step=>step.op=="account"?accounts[step.account].Command(step.text):inventories[step.profile].Command(step.text);
        var result=new Result {stage=stage,unity=Application.unityVersion};
        try
        {
            using(var output=new StreamWriter(Path.Combine(Work,stage+"-replies.jsonl")))
            foreach(var step in input.steps)
            {
                string reply=null;bool refused=false;
                try
                {
                    switch(step.op)
                    {
                        case "open-account":accounts.Add(step.account,host.OpenAccount(step.account,step.key,step.seed,step.text));reply="{\"ok\":true}";break;
                        case "open-workshop":inventories.Add(step.profile,accounts[step.account].OpenInventory(step.profile,step.seed,step.text,step.progression,step.nextUid));reply="{\"ok\":true}";break;
                        case "account":reply=accounts[step.account].Execute(step.text);break;
                        case "workshop":reply=inventories[step.profile].Execute(step.text);break;
                        case "account-save":reply=Save(accounts[step.account].Save());break;
                        case "workshop-save":reply=Save(inventories[step.profile].Save());break;
                        case "prepare":
                            var next=host.Prepare(step.commands.Select(command).ToArray());
                            reply=JsonUtility.ToJson(new Prepared {text=next.RepliesJson,hasChanges=next.HasChanges,
                                writes=next.Writes.Select(write=>new Write {kind=write.Kind,handle=write.Handle}).ToArray()});
                            if(next.HasChanges)prepared.Add(step.token,next);else next.Commit();break;
                        case "prepared-save":
                            var pending=prepared[step.token];var index=pending.Writes.Select((write,i)=>new {write,i})
                                .Single(row=>row.write.Kind==step.kind&&row.write.Handle==step.handle).i;
                            reply=Save(pending.Save(index));break;
                        case "commit-prepared":prepared[step.token].Commit();reply="{\"ok\":true}";break;
                        case "abort-prepared":
                            // Disposal is deliberately idempotent at the typed boundary.
                            prepared[step.token].Dispose();reply="{\"ok\":true}";break;
                        case "close-workshop":inventories[step.profile].Dispose();inventories.Remove(step.profile);reply="{\"ok\":true}";break;
                        case "close-account":accounts[step.account].Dispose();accounts.Remove(step.account);reply="{\"ok\":true}";break;
                        default:throw new Exception("Unknown shared qualification operation "+step.op);
                    }
                }
                catch(InvalidOperationException){if(!step.throws)throw;refused=true;reply="{\"threw\":true}";}
                Need(refused==step.throws,"Unexpected refusal at "+result.steps);output.WriteLine(reply);result.steps++;
            }
            using(var example=host.OpenAccount(9,"example-account",17))
            {
                var grant=JsonUtility.FromJson<Mutation>(example.Execute(@"{""op"":""observe"",""level"":1,""credits"":1000,""ledger"":{},""roster"":[]}"));
                Need(grant.ok&&grant.reply.ok,"Documented example grant refused");
                const string emptyInventory=@"{""board"":{""w"":6,""h"":6},""items"":[],""overflow"":[],""equipped"":{},""essences"":{}}";
                using(var inventory=example.OpenInventory(9,71,emptyInventory))
                {
                    var purchase=JsonUtility.FromJson<Mutation>(example.Execute(@"{""op"":""buy"",""id"":""memory_discovery""}"));
                    Need(purchase.ok&&purchase.reply.ok&&purchase.reply.result,"Documented example purchase refused");
                    var saved=example.Save().Json;Need(JsonUtility.FromJson<AccountSaveView>(saved).progression.account.credits==970,"Documented example price changed");
                    File.WriteAllText(Path.Combine(Work,stage+"-documentation-account.json"),saved);
                    File.WriteAllText(Path.Combine(Work,stage+"-documentation-inventory.json"),inventory.Save().Json);
                }
            }
            result.documentationExample=true;
            var initial=input.steps.First(step=>step.op=="open-account");var inventoryInput=input.steps.First(step=>step.op=="open-workshop");
            var old=host.OpenAccount(7,"retirement",initial.seed,initial.text);
            var oldInventory=old.OpenInventory(7,17,inventoryInput.text);
            var oldCommand=oldInventory.Command("{\"op\":\"options\",\"uid\":1001,\"offset\":0,\"limit\":1}");
            oldInventory.Dispose();old.Dispose();
            using(var account=host.OpenAccount(7,"retirement",initial.seed,initial.text))
            using(var inventory=account.OpenInventory(7,17,inventoryInput.text))
            {
                var before=account.Save().Json;var beforeInventory=inventory.Save().Json;
                Refuses(()=>old.Save(),"Retired account reached reused handle");result.retiredAccount=true;
                Refuses(()=>oldInventory.Save(),"Retired inventory reached reused handle");result.retiredInventory=true;
                Refuses(()=>host.Prepare(oldCommand),"Retired command reached reused handle");result.retiredCommand=true;
                old.Dispose();oldInventory.Dispose();Need(account.Save().Json==before&&inventory.Save().Json==beforeInventory,"Retired handles altered current owners");
            }
            var live=host.OpenAccount(1,"closed-owner",initial.seed,initial.text);var foreign=live.Command("{\"op\":\"buy\",\"id\":\"memory_discovery\"}");
            result.peak=host.ReadMetrics().PeakBytes;result.requests=host.ReadTraffic().Requests;host.Dispose();
            Refuses(()=>live.Save(),"Closed owner remained usable");live.Dispose();result.ownerDisposal=true;
            using(var other=SharedAccountWorkshop.Open(32))
            {
                try { other.Prepare(foreign);throw new Exception("Foreign owner command admitted"); }
                catch(ArgumentException){result.foreignOwner=true;}
            }
            var final=host.ReadMetrics();result.closed=final.LiveBytes==0&&final.LiveBlocks==0;
            Need(result.closed&&result.peak<=32*1024*1024,"Native budget or disposal failure");result.passed=true;
            File.WriteAllText(Path.Combine(Work,stage+"-result.json"),JsonUtility.ToJson(result));
        }
        finally{host.Dispose();}
    }
    void Start(){try{Run("player");Application.Quit(0);}catch(Exception error){Debug.LogException(error);Application.Quit(1);}}
}
