using System;
using System.Globalization;
using System.IO;
using HollowWake.Storage;
using UnityEngine;

/// <summary>Example-owned starting credits and free forging demonstrate two
/// separate commands sharing one durable view. Display models are read-only.</summary>
public sealed class DurableAccountWorkbench : MonoBehaviour
{
    const string Initial=@"{""board"":{""w"":6,""h"":6},""items"":[],""overflow"":[],""equipped"":{},""essences"":{},""account"":{""features"":[],""ledger"":{},""craftLore"":{},""progression"":true}}";
    const string Grant=@"{""op"":""observe"",""level"":1,""credits"":1000,""ledger"":{},""roster"":[]}";
    const string Memory=@"{""op"":""buy"",""id"":""memory_discovery""}";
    const string Forge=@"{""op"":""mint"",""kind"":""forge"",""options"":{""baseId"":""helmet_armor"",""ilvl"":1,""rarity"":""common"",""sockets"":2,""quality"":0.5}}";
    [Serializable] class AccountView { public Account account; }
    [Serializable] class Account { public long credits; }
    [Serializable] class WorkshopView { public Inventory state; }
    [Serializable] class Inventory { public Item[] items,overflow; }
    [Serializable] class Item { public long uid; }
    DurableAccountWorkshop owner;
    string pendingMessage;
    GUIStyle title,body;
    public string Status { get; private set; }="Open your account and workshop.";
    public long Credits { get; private set; }
    public int ItemCount { get; private set; }
    public AccountWorkshopSnapshot Current=>owner?.Current;
    public bool IsOpen=>owner!=null && !owner.IsDisposed;
    public bool IsBusy=>IsOpen && owner.IsBusy;
    public bool IsReady=>IsOpen && owner.IsReady;

    public void OpenAccount(string directory=null)
    {
        if(IsOpen)return;
        var folder=directory??Path.Combine(Application.persistentDataPath,"HollowWakeAccountWorkshop");
        Directory.CreateDirectory(folder);
        owner=new DurableAccountWorkshop(Path.Combine(folder,"account-inventory.db"),10,20);
        try
        {
            if(owner.IsReady){Refresh();Status="Saved account and inventory loaded.";return;}
            pendingMessage="Account created with 1,000 example credits.";
            Observe(owner.BeginCreate(17,null,17,Initial,"{\"items\":[]}",accountCommands:new[]{Grant}));
        }
        catch{CloseAccount();throw;}
    }
    public void DiscoverMemory()
    {
        if(!IsReady || IsBusy)return;
        pendingMessage="Memory discovered and saved.";
        Observe(owner.Submit(accountCommandJson:Memory));
    }
    public void ForgeHelmet()
    {
        if(!IsReady || IsBusy)return;
        pendingMessage="Helmet forged and saved.";
        Observe(owner.Submit(workshopCommandJson:Forge));
    }
    public void ReloadSaved()
    {
        if(!IsOpen || IsBusy)return;
        pendingMessage="Saved account and inventory reloaded.";
        Observe(owner.Reload());
    }
    void Refresh()
    {
        var view=owner.Current;
        Credits=JsonUtility.FromJson<AccountView>(view.AccountJson).account.credits;
        var inventory=JsonUtility.FromJson<WorkshopView>(view.WorkshopJson).state;
        ItemCount=(inventory.items?.Length??0)+(inventory.overflow?.Length??0);
    }
    void Observe(AccountWorkshopChange change)
    {
        if(change.State==WorkshopChangeState.Pending){Status="Saving…";return;}
        if(change.Succeeded)
        {
            Refresh();Status=change.State==WorkshopChangeState.Unchanged?"Nothing changed.":pendingMessage;return;
        }
        if(change.StorageStatus==SaveStatus.StaleRevision)Status="Another session saved changes. Reload to continue.";
        else if(change.StorageStatus==SaveStatus.Busy)Status="Saving is busy. Try again.";
        else if(change.Reason=="account-action-refused")Status="Memory discovery is unavailable.";
        else Status="The change was not saved. Your account and inventory are unchanged.";
    }
    public void PollSave()
    {
        if(!IsBusy)return;
        try{Observe(owner.Poll());}
        catch(IOException)
        {
            CloseAccount();
            Status="The save completed but could not be shown. Reopen to load the saved account and inventory.";
            throw;
        }
    }
    void Update(){PollSave();}
    void OnGUI()
    {
        if(title==null)
        {
            title=new GUIStyle(GUI.skin.label){fontSize=28,fontStyle=FontStyle.Bold};
            body=new GUIStyle(GUI.skin.label){fontSize=16,wordWrap=true};
        }
        GUILayout.BeginArea(new Rect(36,36,640,460),GUI.skin.box);
        GUILayout.Space(18);GUILayout.Label("Your account and workshop",title);
        GUILayout.Label("Discover memories. Forge equipment. Return to both.",body);
        GUILayout.Space(24);
        GUILayout.Label("Credits: "+Credits.ToString(CultureInfo.InvariantCulture)+"\nSaved equipment: "+ItemCount.ToString(CultureInfo.InvariantCulture),body);
        GUILayout.Space(18);
        if(!IsOpen)
        {
            if(GUILayout.Button("Open account",GUILayout.Height(38)))OpenAccount();
        }
        else
        {
            GUI.enabled=IsReady && !IsBusy;
            if(GUILayout.Button("Discover memory · 30 credits",GUILayout.Height(38)))DiscoverMemory();
            if(GUILayout.Button("Forge example helmet · free",GUILayout.Height(38)))ForgeHelmet();
            GUI.enabled=!IsBusy;
            if(GUILayout.Button("Reload saved account and inventory",GUILayout.Height(38)))ReloadSaved();
            GUI.enabled=true;
        }
        GUILayout.Space(18);GUILayout.Label(Status,body);
        GUILayout.Space(12);GUILayout.Label("Wait for the saved confirmation before leaving.");
        GUILayout.EndArea();
    }
    public void CloseAccount()
    {
        try{owner?.Dispose();}
        finally{owner=null;}
    }
    void OnDisable(){CloseAccount();}
}
