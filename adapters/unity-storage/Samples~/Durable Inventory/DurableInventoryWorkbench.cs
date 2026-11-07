using System;
using System.Globalization;
using System.IO;
using HollowWake.Storage;
using UnityEngine;

/// <summary>A small durable inventory example. Display fields are read from
/// committed snapshots; partial UI models are never written back to storage.</summary>
public sealed class DurableInventoryWorkbench : MonoBehaviour
{
    const string Initial=@"{""board"":{""w"":6,""h"":6},""items"":[],""overflow"":[],""equipped"":{},""essences"":{},""account"":{""features"":[],""ledger"":{},""craftLore"":{},""progression"":true}}";
    const string Grant=@"{""op"":""grant-vestige"",""id"":""morren"",""count"":1}";
    const string Forge=@"{""op"":""mint"",""kind"":""forge"",""options"":{""baseId"":""helmet_armor"",""ilvl"":1,""rarity"":""common"",""sockets"":2,""quality"":0.5}}";
    [Serializable] class View { public Inventory state; }
    [Serializable] class Inventory { public Item[] items,overflow; }
    [Serializable] class Item { public long uid; public string baseId; }
    DurableWorkshop workshop;
    string pendingMessage,summary="Your workshop is ready to open.";
    GUIStyle title,subtitle;
    public string Status { get; private set; }="Open the workshop to load or create your inventory.";
    public long LastUid { get; private set; }
    public string Snapshot => workshop?.Snapshot;
    public ulong Revision => workshop?.Revision??0;
    public bool IsOpen => workshop!=null && !workshop.IsDisposed;
    public bool IsBusy => IsOpen && workshop.IsBusy;
    public bool IsReady => IsOpen && workshop.IsReady;

    // The normal sample uses Unity's per-application save directory. Tests
    // supply an isolated directory before opening and remove it afterward.
    public void OpenWorkshop(string directory=null)
    {
        if(IsOpen)return;
        var folder=directory??Path.Combine(Application.persistentDataPath,"HollowWakeWorkshop");
        Directory.CreateDirectory(folder);
        workshop=new DurableWorkshop(Path.Combine(folder,"inventory.db"),1);
        try
        {
            if(workshop.IsReady){RefreshView();Status="Saved inventory loaded.";return;}
            pendingMessage="Workshop created. One Morren is available.";
            Observe(workshop.BeginCreate(17,Initial,"{\"version\":1,\"items\":[]}",0,Grant));
        }
        catch{CloseWorkshop();throw;}
    }
    public void ForgeHelmet()
    {
        if(!IsReady || IsBusy)return;
        pendingMessage="Helmet forged and saved.";
        Observe(workshop.Submit(Forge));
    }
    public void InlayMorren()
    {
        if(!IsReady || IsBusy || LastUid==0)return;
        pendingMessage="Morren inlaid and saved.";
        Observe(workshop.Submit("{\"op\":\"inlay-vestige\",\"uid\":"+LastUid.ToString(CultureInfo.InvariantCulture)+",\"id\":\"morren\"}"));
    }
    public void ReloadSaved()
    {
        if(!IsOpen || IsBusy)return;
        pendingMessage="Saved inventory reloaded.";
        Observe(workshop.Reload());
    }
    void Observe(WorkshopChange change)
    {
        if(change.State==WorkshopChangeState.Pending){Status="Saving…";return;}
        if(change.Succeeded)
        {
            RefreshView();
            Status=change.State==WorkshopChangeState.Unchanged?"Nothing changed.":pendingMessage;
            return;
        }
        if(change.StorageStatus==SaveStatus.StaleRevision)Status="Another session saved changes. Reload to continue.";
        else if(change.StorageStatus==SaveStatus.Busy)Status="Save is busy. Your inventory is unchanged; try again.";
        else Status="The change was not saved. Your inventory is unchanged.";
    }
    void RefreshView()
    {
        var view=JsonUtility.FromJson<View>(workshop.Snapshot);
        int count=0;LastUid=0;
        foreach(var rows in new[]{view.state.items,view.state.overflow})
            if(rows!=null)foreach(var item in rows){count++;LastUid=Math.Max(LastUid,item.uid);}
        summary=count==0?"No equipment yet. Forge your first helmet.":
            count.ToString(CultureInfo.InvariantCulture)+" equipment item"+(count==1?"":"s")+" saved.\n"+
            "Latest item: "+LastUid.ToString(CultureInfo.InvariantCulture)+"\n"+
            "Saved revision: "+workshop.Revision.ToString(CultureInfo.InvariantCulture);
    }
    void Update() { if(IsBusy)Observe(workshop.Poll()); }
    void OnGUI()
    {
        if(title==null)
        {
            title=new GUIStyle(GUI.skin.label){fontSize=28,fontStyle=FontStyle.Bold};
            subtitle=new GUIStyle(GUI.skin.label){fontSize=16,wordWrap=true};
        }
        GUILayout.BeginArea(new Rect(36,36,640,430),GUI.skin.box);
        GUILayout.Space(18);GUILayout.Label("The durable workshop",title);
        GUILayout.Label("Forge. Inlay. Return to your saved inventory.",subtitle);
        GUILayout.Space(22);GUILayout.Label(summary,subtitle);GUILayout.Space(20);
        if(!IsOpen)
        {
            if(GUILayout.Button("Open workshop",GUILayout.Height(38)))OpenWorkshop();
        }
        else
        {
            GUI.enabled=IsReady && !IsBusy;
            if(GUILayout.Button("Forge helmet",GUILayout.Height(38)))ForgeHelmet();
            GUI.enabled=IsReady && !IsBusy && LastUid!=0;
            if(GUILayout.Button("Inlay Morren",GUILayout.Height(38)))InlayMorren();
            GUI.enabled=!IsBusy;
            if(GUILayout.Button("Reload saved inventory",GUILayout.Height(38)))ReloadSaved();
            GUI.enabled=true;
        }
        GUILayout.Space(16);GUILayout.Label(Status,subtitle);
        GUILayout.Space(10);GUILayout.Label("Changes appear after saving. Close and reopen to continue.");
        GUILayout.EndArea();
    }
    public void CloseWorkshop()
    {
        try{workshop?.Dispose();}
        finally{workshop=null;}
    }
    void OnDisable(){CloseWorkshop();}
}
