using System;
using HollowWake.Gameplay;
using UnityEngine;

/// <summary>Attach to an active GameObject. The example authorizes 1,000 starting
/// credits once per open account. Checkpoints are in memory, not durable storage.</summary>
public sealed class AccountProgressionExample : MonoBehaviour
{
    public string status="Open an example account to discover memories.";
    public long credits;
    AccountProgression owner;
    AccountProgression.Profile profile;
    uint profileId;
    string checkpoint;
    [Serializable] class Reply {public bool ok,result;public string reason;public long credits;}
    [Serializable] class Account {public long credits;}
    [Serializable] class Snapshot {public Account account;}
    void Refresh()=>credits=JsonUtility.FromJson<Snapshot>(profile.Save()).account.credits;
    public void OpenAccount()
    {
        if(owner!=null)return;
        owner=new AccountProgression();
        try
        {
            profileId=0;profile=owner.OpenProfile(profileId,17);
            var granted=JsonUtility.FromJson<Reply>(profile.Observe(1,1000,"{}","[]"));
            if(!granted.ok)throw new InvalidOperationException(granted.reason);
            Refresh();status="Example account ready.";
        }
        catch{OnDisable();throw;}
    }
    public void DiscoverMemory()
    {
        OpenAccount();
        var reply=JsonUtility.FromJson<Reply>(profile.Buy("memory_discovery"));
        if(!reply.ok)throw new InvalidOperationException(reply.reason);
        Refresh();status=reply.result?"Memory discovered.":"Discovery is unavailable.";
    }
    public string CurrentSnapshot()=>profile?.Save();
    public void CaptureCheckpoint()
    {
        if(profile==null)return;
        checkpoint=profile.Save();status="Checkpoint kept in memory.";
    }
    public void RestoreCheckpoint()
    {
        if(profile==null||checkpoint==null)return;
        uint next=profileId==0?1u:0u;
        var replacement=owner.RestoreProfile(next,checkpoint);
        profile.Dispose();profile=replacement;profileId=next;
        Refresh();status="Account and random continuation restored.";
    }
    void OnGUI()
    {
        GUILayout.BeginArea(new Rect(20,320,330,230),GUI.skin.box);
        GUILayout.Label("Account progression");
        if(owner==null){if(GUILayout.Button("Open example account"))OpenAccount();}
        else
        {
            GUILayout.Label("Credits: "+credits);
            if(GUILayout.Button("Discover memory · 30 credits"))DiscoverMemory();
            if(GUILayout.Button("Keep checkpoint"))CaptureCheckpoint();
            if(checkpoint!=null&&GUILayout.Button("Restore checkpoint"))RestoreCheckpoint();
        }
        GUILayout.Label(status);
        GUILayout.Label("Example credits and checkpoints last until this component closes.");
        GUILayout.EndArea();
    }
    void OnDisable()
    {
        try{profile?.Dispose();}
        finally{owner?.Dispose();owner=null;profile=null;checkpoint=null;}
    }
}
