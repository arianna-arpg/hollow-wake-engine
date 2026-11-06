using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using HollowWake.Pouches;

static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value);
static void Equal(JsonElement actual, JsonElement expected, string label)
{
    if (!JsonNode.DeepEquals(JsonNode.Parse(actual.GetRawText()), JsonNode.Parse(expected.GetRawText())))
        throw new Exception(label + ": " + actual.GetRawText());
}
static string? Text(JsonElement e, string key) => e.TryGetProperty(key, out var v) ? v.GetString() : null;
if(args.Length==2&&args[0]=="--damaged")
{
    try { using var unexpected=new MemoryPouches(args[1]); }
    catch(InvalidDataException) { Console.WriteLine("damaged content rejected"); return; }
    throw new Exception("A modified rules file was accepted");
}
using var input=JsonDocument.Parse(File.ReadAllBytes(args[0]));
var data=input.RootElement;
var host=new MemoryPouches();
try
{
    int actions=0,cuts=0;
    foreach (var a in data.GetProperty("actions").EnumerateArray())
    {
        string mode=Text(a,"mode")!;
        var ledger=a.TryGetProperty("beforeLedger",out var starting)?starting:Json(new {});
        var state=Json(new {items=a.GetProperty("before"),board=new {w=12,h=8},account=new {ledger,features=Array.Empty<string>(),progression=mode!="immortal"}});
        var p=new RecallProfile(state,1,mode=="sealed");
        long uid=a.GetProperty("uid").GetInt64();
        var view=host.Inspect(p,uid);
        if(a.GetProperty("view").ValueKind!=JsonValueKind.Null)Equal(view.GetProperty("view"),a.GetProperty("view"),mode+" view");
        else if(view.GetProperty("ok").GetBoolean())throw new Exception("Missing item produced panel");
        bool ok=a.GetProperty("result").ValueKind!=JsonValueKind.Null;
        long next=ok?a.GetProperty("item").GetProperty("uid").GetInt64():987654;
        var move=host.Recall(p,uid,Text(a,"group")!,next,Text(a,"facet"));
        if(move.GetProperty("ok").GetBoolean()!=ok)throw new Exception(mode+" unexpected result");
        if(ok)
        {
            Equal(move.GetProperty("result"),a.GetProperty("result"),mode);
            Equal(move.GetProperty("items").EnumerateArray().Last(),a.GetProperty("item"),mode+" item");
            Equal(move.GetProperty("ledger"),a.GetProperty("ledger"),mode+" ledger");
            Equal(move.GetProperty("memory").GetProperty("seatLedger"),a.GetProperty("seatLedger"),mode+" player");
            Equal(move.GetProperty("memory").GetProperty("secondary"),a.GetProperty("secondary"),mode+" discovery");
        }
        else if(a.GetProperty("floats").GetArrayLength()>0)
            Equal(move.GetProperty("reason"),a.GetProperty("floats")[0],mode+" refusal");
        actions++;
    }
    var memories=data.GetProperty("profiles").EnumerateArray().Select(a=>host.CreateMemory(
        a.GetProperty("skills").EnumerateArray().Select(s=>s.GetString()!),
        a.GetProperty("supports").EnumerateArray().Select(s=>s.GetString()!))).ToArray();
    if(host.ContentId!=Text(data,"id"))throw new Exception("Wrong content identity");
    foreach(var row in data.GetProperty("cases").EnumerateArray())
    {
        var access=data.GetProperty("profiles")[row.GetProperty("profile").GetInt32()];
        var unit=row.GetProperty("unit");string group=Text(unit,"d")!;
        if(unit.TryGetProperty("g",out var pin))group+="|"+Text(pin,"k")+":"+Text(pin,"id");
        string? facet=Text(row,"facet");
        var item=new {uid=1,x=0,y=0,baseId=facet==null?"rough_memory":"preformed_memory",mem=new[]{unit}};
        var features=access.GetProperty("all").GetBoolean()?new[]{Text(data,"unlockAll")!}:Array.Empty<string>();
        var state=Json(new {items=new[]{item},board=new {w=1,h=1},account=new {ledger=new {},features,progression=true}});
        var memory=memories[row.GetProperty("profile").GetInt32()];
        var profile=new RecallProfile(state,access.GetProperty("level").GetInt32(),false,memory);
        var result=host.Recall(profile,1,group,4294967301L,facet);
        if(!result.GetProperty("ok").GetBoolean()||result.GetProperty("nextUid").GetInt64()!=4294967302L)
            throw new Exception("UID or grant lost for "+cuts);
        Equal(result.GetProperty("items")[0].GetProperty("gem"),row.GetProperty("gem"),"cut "+cuts);
        cuts++;
    }
    ulong peak=host.PeakEmbeddedBytes;
    host.Dispose();
    if(host.ReleasedLiveBytes!=0||actions!=15||cuts!=2304)throw new Exception("Incomplete managed replay");
    Console.WriteLine(JsonSerializer.Serialize(new {actions,cuts,peakEmbeddedBytes=peak,releasedBytes=host.ReleasedLiveBytes,
        framework=System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,largeUids=true}));
}
finally {host.Dispose();}
