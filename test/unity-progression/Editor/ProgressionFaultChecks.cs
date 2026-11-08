using System;
using HollowWake.Gameplay;
using UnityEngine;

public static class ProgressionFaultChecks
{
    static void Need(bool value,string message){if(!value)throw new Exception(message);}
    public static void Run()
    {
        var host=new AccountProgression();
        try
        {
            var first=host.OpenProfile(0,17);
            Need(first.Observe(1,1000,"{}","[]").Contains("\"ok\":true"),"Initial observations refused");
            Need(first.Buy("memory_discovery").Contains("\"result\":true"),"Initial purchase refused");
            var saved=first.Save();
            using(var second=host.RestoreProfile(1,saved))
            {
                Need(second.Save()==saved,"Restore changed complete snapshot");
                Need(second.Buy("memory_discovery").Contains("\"result\":true"),"Second purchase refused");
                Need(first.Save()==saved,"Cross-profile purchase changed another account");
            }
            first.Dispose();
            using(var replacement=host.RestoreProfile(0,saved))
            {
                bool refused=false;
                try{first.Save();}catch(ObjectDisposedException){refused=true;}
                Need(refused,"Retired profile reached replacement");
                first.Dispose();Need(replacement.Save()==saved,"Retired profile closed replacement");
            }
        }
        finally{host.Dispose();}
        var metrics=host.ReadMetrics();
        Need(metrics.LiveBytes==0&&metrics.LiveBlocks==0,"Progression host leaked allocations");
        Debug.Log("HWE_PROGRESSION_CONTROLS_PASSED");
    }
}
