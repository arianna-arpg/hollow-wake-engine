using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using UnityEngine;

public sealed class AccountSampleReplay : MonoBehaviour
{
    static void Finish(DurableAccountWorkbench sample)
    {
        var clock=Stopwatch.StartNew();
        while(sample.IsBusy)
        {
            sample.PollSave();
            AccountStorageReplay.Need(clock.ElapsedMilliseconds<10000,"Sample save timed out");
            Thread.Sleep(1);
        }
        AccountStorageReplay.Need(sample.IsReady,"Sample did not publish a ready view");
    }
    static void Capture(string stage,string name,DurableAccountWorkbench sample)
    {
        File.WriteAllText(Path.Combine(AccountStorageReplay.Work,stage+"-"+name+"-account.json"),sample.Current.AccountJson);
        File.WriteAllText(Path.Combine(AccountStorageReplay.Work,stage+"-"+name+"-workshop.json"),sample.Current.WorkshopJson);
    }
    public static void Run(string stage)
    {
        var sample=FindObjectOfType<DurableAccountWorkbench>();
        AccountStorageReplay.Need(sample!=null,"Imported sample component missing");
        var folder=Path.Combine(AccountStorageReplay.Work,stage+"-saves");
        try
        {
            sample.OpenAccount(folder);
            AccountStorageReplay.Need(sample.IsBusy && sample.Current==null,"Sample creation published early");
            Finish(sample);Capture(stage,"initial",sample);
            AccountStorageReplay.Need(sample.Credits==1000 && sample.ItemCount==0,"Sample initial grant");
            var before=sample.Current;sample.DiscoverMemory();
            AccountStorageReplay.Need(sample.IsBusy && ReferenceEquals(before,sample.Current) && sample.Credits==1000,"Sample memory appeared early");
            Finish(sample);Capture(stage,"memory",sample);
            AccountStorageReplay.Need(sample.Credits==970 && sample.ItemCount==0,"Sample discovery display");
            before=sample.Current;sample.ForgeHelmet();
            AccountStorageReplay.Need(sample.IsBusy && ReferenceEquals(before,sample.Current) && sample.ItemCount==0,"Sample forge appeared early");
            Finish(sample);Capture(stage,"forge",sample);
            AccountStorageReplay.Need(sample.Credits==970 && sample.ItemCount==1,"Sample forge display");
            before=sample.Current;sample.CloseAccount();
            AccountStorageReplay.Need(!sample.IsOpen && !sample.IsBusy,"Sample close retained owner");
            sample.OpenAccount(folder);
            AccountStorageReplay.Need(sample.IsReady && !sample.IsBusy && sample.Current.AccountJson==before.AccountJson &&
                sample.Current.WorkshopJson==before.WorkshopJson && sample.Credits==970,"Sample reopened with duplicate initial grant");
            sample.ReloadSaved();
            AccountStorageReplay.Need(sample.Current.AccountRevision==before.AccountRevision &&
                sample.Current.WorkshopRevision==before.WorkshopRevision,"Sample reload wrote a group");
            sample.DiscoverMemory();Finish(sample);Capture(stage,"continued",sample);
            AccountStorageReplay.Need(sample.Credits==940 && sample.ItemCount==1,"Sample continuation");
            sample.CloseAccount();
            File.WriteAllText(Path.Combine(AccountStorageReplay.Work,stage+"-result.json"),"{\"passed\":true,\"closed\":true}");
        }
        finally{sample.CloseAccount();}
    }
    void Start()
    {
        try{Run("sample-player");Application.Quit(0);}
        catch(Exception error){UnityEngine.Debug.LogException(error);Application.Quit(1);}
    }
}
