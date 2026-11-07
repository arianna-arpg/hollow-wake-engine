using System;
using HollowWake.Gameplay;
using UnityEngine;

/// <summary>An on-demand workshop. Checkpoints stay in memory; the game owns
/// durable storage. The sample grants its crafting materials on first open.</summary>
public sealed class InventoryWorkbench : MonoBehaviour
{
    public string status="Open the workshop to forge and inlay a helmet.";
    public long lastUid;
    public string savedSnapshot;
    CraftingWorkshop workshop;
    CraftingWorkshop.Profile profile;
    uint profileId=1;
    long savedUid;
    [Serializable] class Item { public long uid; public string name; }
    [Serializable] class Reply { public bool ok; public string reason; public Item result; }
    [Serializable] class Outcome { public bool ok; public string reason; public Change result; }
    [Serializable] class Change { public bool changed; public string reason; }
    public void OpenWorkshop()
    {
        if(workshop!=null)return;
        workshop=new CraftingWorkshop();
        try
        {
            profileId=1;
            profile=workshop.OpenProfile(profileId,17,"{\"board\":{\"w\":6,\"h\":6},\"items\":[],\"overflow\":[],\"equipped\":{},\"essences\":{},\"account\":{\"features\":[],\"ledger\":{},\"craftLore\":{},\"progression\":true}}");
            var grant=JsonUtility.FromJson<Outcome>(profile.Execute("{\"op\":\"grant-vestige\",\"id\":\"morren\",\"count\":1}"));
            if(!grant.ok||!grant.result.changed)throw new InvalidOperationException("Sample material grant failed.");
            status="Workshop ready. One Morren is available.";
            lastUid=0;
        }
        catch{OnDisable();throw;}
    }
    public void ForgeHelmet()
    {
        OpenWorkshop();
        var reply=JsonUtility.FromJson<Reply>(profile.Execute("{\"op\":\"mint\",\"kind\":\"forge\",\"options\":{\"baseId\":\"helmet_armor\",\"ilvl\":1,\"rarity\":\"common\",\"sockets\":2,\"quality\":0.5}}"));
        if(!reply.ok){status=reply.reason;return;}
        lastUid=reply.result.uid;status="Forged "+reply.result.name+".";
    }
    public void InlayMorren()
    {
        if(profile==null||lastUid==0)return;
        var reply=JsonUtility.FromJson<Outcome>(profile.Execute("{\"op\":\"inlay-vestige\",\"uid\":"+lastUid.ToString(System.Globalization.CultureInfo.InvariantCulture)+",\"id\":\"morren\"}"));
        status=reply.ok&&reply.result.changed?"Morren inlaid.":(reply.reason??reply.result?.reason);
    }
    public string CurrentSnapshot()=>profile?.Save();
    public void CaptureCheckpoint()
    {
        if(profile==null)return;
        savedSnapshot=profile.Save();savedUid=lastUid;status="Checkpoint kept in memory.";
    }
    public void RestoreCheckpoint()
    {
        if(workshop==null||String.IsNullOrEmpty(savedSnapshot))return;
        uint replacementId=profileId==1?2u:1u;
        // Validate the replacement before retiring the current live profile.
        var replacement=workshop.RestoreProfile(replacementId,savedSnapshot);
        profile.Dispose();profile=replacement;profileId=replacementId;lastUid=savedUid;
        status="Restored the checkpoint, including item IDs and random state.";
    }
    void OnGUI()
    {
        GUILayout.BeginArea(new Rect(320,20,330,280),GUI.skin.box);
        GUILayout.Label("Inventory workshop");
        if(workshop==null){if(GUILayout.Button("Open workshop"))OpenWorkshop();}
        else
        {
            if(GUILayout.Button("Forge helmet"))ForgeHelmet();
            if(lastUid!=0&&GUILayout.Button("Inlay Morren"))InlayMorren();
            if(GUILayout.Button("Keep checkpoint"))CaptureCheckpoint();
            if(!String.IsNullOrEmpty(savedSnapshot)&&GUILayout.Button("Restore checkpoint"))RestoreCheckpoint();
        }
        GUILayout.Label(status);
        GUILayout.Label("Checkpoints are kept in memory until the scene closes.");
        GUILayout.EndArea();
    }
    void OnDisable()
    {
        try{profile?.Dispose();}
        finally{workshop?.Dispose();profile=null;workshop=null;}
    }
}
