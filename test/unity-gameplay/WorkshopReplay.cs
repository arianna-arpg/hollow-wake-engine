using System;
using HollowWake.Gameplay;
using UnityEngine;

public static class WorkshopReplay
{
    [Serializable] class Item { public long uid; public string[] sockets; }
    [Serializable] class Mutation { public bool changed; }
    [Serializable] class Mint { public bool ok; public Item result; }
    [Serializable] class Action { public bool ok; public string reason; public Mutation result; }
    static bool Changed(string json){var a=JsonUtility.FromJson<Action>(json);return a.ok&&a.result!=null&&a.result.changed;}
    public static void Check(GameplayReplay.Result result)
    {
        const string state="{\"board\":{\"w\":4,\"h\":4},\"items\":[],\"overflow\":[],\"equipped\":{},\"essences\":{\"brilliant\":100},\"account\":{\"features\":[],\"ledger\":{},\"craftLore\":{},\"progression\":true}}";
        const string mint="{\"op\":\"mint\",\"kind\":\"forge\",\"options\":{\"baseId\":\"helmet_armor\",\"ilvl\":1,\"rarity\":\"common\",\"sockets\":2,\"quality\":0.5}}";
        var workshop=new CraftingWorkshop();
        CraftingWorkshop.Profile left=null;
        try
        {
            left=workshop.OpenProfile(1,17,state,4294967301L);
            using(var untouched=workshop.OpenProfile(2,19,state))
            {
                string before=untouched.Save();
                var gear=JsonUtility.FromJson<Mint>(left.Execute(mint));
                GameplayReplay.Need(gear.ok&&gear.result.uid==4294967301L,"Workshop item ID lost precision");
                GameplayReplay.Need(Changed(left.Execute("{\"op\":\"grant-vestige\",\"id\":\"morren\",\"count\":1}")),"Vestige grant");
                GameplayReplay.Need(Changed(left.Execute("{\"op\":\"inlay-vestige\",\"uid\":4294967301,\"id\":\"morren\"}")),"Vestige inlay");
                string saved=left.Save();
                GameplayReplay.Need(saved.Contains("\"sockets\":[\"morren\",null]"),"Socket did not preserve its inlay");
                GameplayReplay.Need(left.Execute("{\"op\":\"save\",\"profile\":2}").Contains("invalid-profile-command"),"Profile handle override accepted");
                GameplayReplay.Need(workshop.Query("{\"op\":\"close\",\"profile\":1}").Contains("invalid-workshop-query"),"Read query changed state");
                GameplayReplay.Need(saved==left.Save(),"Refused command changed a profile");
                result.workshopIsolation=before==untouched.Save();
                untouched.Dispose();
                bool invalidRestore=false;
                try{workshop.RestoreProfile(2,"{\"schemaVersion\":999}");}
                catch(InvalidOperationException){invalidRestore=true;}
                GameplayReplay.Need(invalidRestore&&saved==left.Save(),"Invalid restore changed the live profile");
                using(var restored=workshop.RestoreProfile(2,saved))
                {
                    GameplayReplay.Need(saved==restored.Save(),"Full snapshot changed during restore");
                    GameplayReplay.Need(left.Execute(mint)==restored.Execute(mint),"Random or item-ID continuation changed");
                    result.workshopContinuation=left.Save()==restored.Save();
                }
                left.Dispose();
                try{left.Save();}catch(ObjectDisposedException){result.workshopClosed=true;}
                using(var reopened=workshop.RestoreProfile(1,saved))
                    GameplayReplay.Need(saved==reopened.Save(),"Closed profile could not be restored");
                const string gems="{\"board\":{\"w\":4,\"h\":4},\"items\":[{\"uid\":20,\"baseId\":\"skill_gem\",\"ilvl\":1,\"tier\":1,\"name\":\"skill\",\"rarity\":\"common\",\"baseRoll\":0,\"implicitRolls\":[],\"affixes\":[],\"x\":0,\"y\":0,\"gem\":{\"kind\":\"skill\",\"skillId\":\"firebolt\",\"level\":1,\"rarity\":\"common\",\"sockets\":[null]}},{\"uid\":21,\"baseId\":\"support_gem\",\"ilvl\":1,\"tier\":1,\"name\":\"support\",\"rarity\":\"common\",\"baseRoll\":0,\"implicitRolls\":[],\"affixes\":[],\"x\":1,\"y\":0,\"gem\":{\"kind\":\"support\",\"supportId\":\"multistrike\",\"level\":1}}],\"overflow\":[],\"equipped\":{},\"essences\":{},\"account\":{\"features\":[],\"ledger\":{},\"craftLore\":{},\"progression\":true}}";
                using(var rack=workshop.OpenProfile(1,19,gems))
                {
                    GameplayReplay.Need(rack.Save().Contains("\"nextUid\":22"),"Initial item IDs were not included in the default counter");
                    GameplayReplay.Need(Changed(rack.Execute("{\"op\":\"learn-skill\",\"uid\":20,\"meets\":true,\"blocked\":{},\"slot\":0}")),"Learned skill rack");
                    GameplayReplay.Need(Changed(rack.Execute("{\"op\":\"socket-support\",\"uid\":21,\"skillId\":\"firebolt\",\"fits\":true,\"hold\":null}")),"Socket custody");
                    string linked=rack.Save();
                    using(var copy=workshop.RestoreProfile(2,linked))
                        GameplayReplay.Need(linked==copy.Save(),"Learned sockets changed on restore");
                    GameplayReplay.Need(Changed(rack.Execute("{\"op\":\"unlearn-skill\",\"skillId\":\"firebolt\",\"blocked\":{}}")),"Unlearning custody");
                    GameplayReplay.Need(rack.Save().Contains("\"supportId\":\"multistrike\""),"Unlearning lost a socket");
                }
                result.typedWorkshop=true;
            }
        }
        finally
        {
            left?.Dispose();workshop.Dispose();
            result.liveBytes+=(long)workshop.ReadMetrics().LiveBytes;
            result.liveBlocks+=(long)workshop.ReadMetrics().LiveBlocks;
        }
    }
}
