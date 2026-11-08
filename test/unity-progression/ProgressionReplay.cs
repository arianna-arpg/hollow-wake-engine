using System;
using System.Collections.Generic;
using System.IO;
using HollowWake.Gameplay;
using UnityEngine;

public sealed class ProgressionReplay : MonoBehaviour
{
    [Serializable] class Step { public string op,id,text,ledger,roster;public uint profile,seed,offset;public int limit;public long amount,level,credits;public bool throws; }
    [Serializable] class Inputs { public Step[] steps; }
    [Serializable] class Result { public bool passed,closed,retiredHandle,ownerDisposal,sample;public string stage,unity;public int steps;public ulong peak,requests; }
    public static string Work=>Environment.GetEnvironmentVariable("HWE_PROGRESSION_WORK");
    public static void Need(bool value,string message){if(!value)throw new Exception(message);}
    static void Refuses(Action action,string message)
    {
        try{action();}catch(ObjectDisposedException){return;}
        throw new Exception(message);
    }
    public static void Run(string stage)
    {
        var input=JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(Work,"inputs.json")));
        var host=new AccountProgression();
        var profiles=new Dictionary<uint,AccountProgression.Profile>();
        var result=new Result{stage=stage,unity=Application.unityVersion};
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
                        case "open":profiles.Add(step.profile,host.OpenProfile(step.profile,step.seed,String.IsNullOrEmpty(step.text)?null:step.text));reply="{\"ok\":true}";break;
                        case "restore":profiles.Add(step.profile,host.RestoreProfile(step.profile,step.text));reply="{\"ok\":true}";break;
                        case "close":profiles[step.profile].Dispose();profiles.Remove(step.profile);reply="{\"ok\":true}";break;
                        case "save":reply=profiles[step.profile].Save();break;
                        case "buy":reply=profiles[step.profile].Buy(step.id);break;
                        case "invest":reply=profiles[step.profile].Invest(step.id,step.amount);break;
                        case "settle":reply=profiles[step.profile].Settle();break;
                        case "acknowledge":reply=profiles[step.profile].Acknowledge(step.id);break;
                        case "catalogue":reply=profiles[step.profile].Catalogue(step.offset,step.limit);break;
                        case "observe":reply=profiles[step.profile].Observe(step.level,step.credits,step.ledger,step.roster);break;
                        case "relics":reply=profiles[step.profile].UpdateRelics(step.text);break;
                        case "execute":reply=profiles[step.profile].Execute(step.text);break;
                        default:throw new Exception("Unknown verification operation "+step.op);
                    }
                }
                catch(InvalidOperationException){if(!step.throws)throw;refused=true;reply="{\"threw\":true}";}
                Need(step.throws==refused,"Unexpected refusal at step "+result.steps);
                output.WriteLine(reply);result.steps++;
            }
            var old=host.OpenProfile(7,1);old.Dispose();
            using(var replacement=host.OpenProfile(7,2))
            {
                var before=replacement.Save();
                Refuses(()=>old.Save(),"Retired profile reached replacement");
                Refuses(()=>old.Buy("memory_discovery"),"Retired profile mutated replacement");
                old.Dispose();
                Need(replacement.Save()==before,"Retired profile closed replacement");
            }
            result.retiredHandle=true;
            var live=host.OpenProfile(1,1);
            result.peak=host.ReadMetrics().PeakBytes;result.requests=host.ReadTraffic().Requests;
            host.Dispose();
            Refuses(()=>live.Save(),"Disposed owner left profile usable");live.Dispose();host.Dispose();
            result.ownerDisposal=true;
            var final=host.ReadMetrics();result.closed=final.LiveBytes==0&&final.LiveBlocks==0;
            Need(result.closed,"Progression native allocations leaked");
            var sampleObject=new GameObject("Imported account example");
            try
            {
                var type=Type.GetType("AccountProgressionExample, Assembly-CSharp");
                Need(type!=null,"Imported progression example missing");
                var sample=sampleObject.AddComponent(type);
                Action<string> invoke=name=>type.GetMethod(name).Invoke(sample,null);
                Func<string> snapshot=()=>(string)type.GetMethod("CurrentSnapshot").Invoke(sample,null);
                invoke("OpenAccount");Need((long)type.GetField("credits").GetValue(sample)==1000,"Sample initial grant");
                invoke("DiscoverMemory");Need((long)type.GetField("credits").GetValue(sample)==970,"Sample purchase");
                invoke("CaptureCheckpoint");var checkpoint=snapshot();
                invoke("DiscoverMemory");var next=snapshot();
                invoke("RestoreCheckpoint");Need(snapshot()==checkpoint,"Sample exact restore");
                invoke("DiscoverMemory");Need(snapshot()==next,"Sample random continuation");result.sample=true;
            }
            finally
            {
                sampleObject.SetActive(false);
                if(Application.isPlaying)Destroy(sampleObject);else DestroyImmediate(sampleObject);
            }
            result.passed=true;
            File.WriteAllText(Path.Combine(Work,stage+"-result.json"),JsonUtility.ToJson(result));
        }
        finally{host.Dispose();}
    }
    void Start()
    {
        try{Run("player");Application.Quit(0);}
        catch(Exception error){Debug.LogException(error);Application.Quit(1);}
    }
}
