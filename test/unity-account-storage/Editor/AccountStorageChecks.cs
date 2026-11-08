using System;
using System.IO;
using System.Linq;
using HollowWake.Gameplay;
using HollowWake.Storage;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class AccountStorageChecks
{
    const string ReloadKey="HollowWake.AccountStorage.Reload";
    static int exits;
    public static void ImportSample()
    {
        var info=UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(UnitySaveStore).Assembly);
        var sample=UnityEditor.PackageManager.UI.Sample.FindByPackage(info.name,info.version).Single(row=>row.displayName=="Durable Account");
        AccountStorageReplay.Need(sample.Import(UnityEditor.PackageManager.UI.Sample.ImportOptions.OverridePreviousImports),"Account sample import");
        AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
        Debug.Log("HWE_ACCOUNT_SAMPLE_IMPORTED");
    }
    public static void VerifyFault()
    {
        AccountStorageReplay.Run("fault");
        Debug.Log("HWE_ACCOUNT_FAULT_SURVIVED");
    }
    public static void VerifyAndBuild()
    {
        foreach(var assembly in new[]{typeof(AccountProgression).Assembly,typeof(UnitySaveStore).Assembly})
            AccountStorageReplay.Need(UnityEditor.PackageManager.PackageInfo.FindForAssembly(assembly).source==PackageSource.LocalTarball,"Actual UPM archives required");
        AccountStorageReplay.Run("editor");
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        new GameObject("Durable account and inventory").AddComponent<AccountStorageReplay>();
        AccountStorageReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/AccountStorage.unity"),"Scene save");
        PlayerSettings.companyName="HollowWakeSdkVerification";PlayerSettings.productName="AccountStorageTest";
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
        var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions {scenes=new[]{"Assets/AccountStorage.unity"},
            locationPathName=Path.Combine(AccountStorageReplay.Work,"Built","AccountStorage.exe"),target=BuildTarget.StandaloneWindows64,
            options=BuildOptions.StrictMode});
        AccountStorageReplay.Need(report.summary.result==BuildResult.Succeeded && report.summary.totalErrors==0,"Player build");
        Debug.Log("HWE_ACCOUNT_STORAGE_BUILT");
    }
    public static void VerifyPlayExit()
    {
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        AccountStorageReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/AccountLifecycle.unity"),"Lifecycle scene");
        EditorSettings.enterPlayModeOptionsEnabled=true;
        EditorSettings.enterPlayModeOptions=EnterPlayModeOptions.DisableDomainReload;
        EditorApplication.playModeStateChanged+=PlayState;
        AccountStorageReplay.StartLifecycle("play-entry-0");
        EditorApplication.EnterPlaymode();
    }
    static void PlayState(PlayModeStateChange state)
    {
        try
        {
            if(state==PlayModeStateChange.EnteredPlayMode)
            {
                AccountStorageReplay.EndLifecycle("play-entry-"+exits);
                AccountStorageReplay.StartLifecycle("play-exit-"+exits);
                EditorApplication.delayCall+=EditorApplication.ExitPlaymode;
            }
            if(state==PlayModeStateChange.EnteredEditMode)
            {
                AccountStorageReplay.EndLifecycle("play-exit-"+exits);
                if(++exits<2)
                {
                    AccountStorageReplay.StartLifecycle("play-entry-"+exits);
                    EditorApplication.delayCall+=EditorApplication.EnterPlaymode;
                }
                else
                {
                    EditorApplication.playModeStateChanged-=PlayState;
                    Debug.Log("HWE_ACCOUNT_PLAY_EXIT");EditorApplication.Exit(0);
                }
            }
        }
        catch(Exception error){Debug.LogException(error);EditorApplication.Exit(1);}
    }
    public static void VerifyReload()
    {
        AccountStorageReplay.StartLifecycle("reload");
        SessionState.SetBool(ReloadKey,true);
        AssemblyReloadEvents.beforeAssemblyReload+=()=>AccountStorageReplay.EndLifecycle("reload");
        EditorUtility.RequestScriptReload();
    }
    [InitializeOnLoadMethod]
    static void AfterReload()
    {
        if(!SessionState.GetBool(ReloadKey,false))return;
        SessionState.EraseBool(ReloadKey);
        EditorApplication.delayCall+=()=>{
            try
            {
                using(var owner=new DurableAccountWorkshop(Path.Combine(AccountStorageReplay.Work,"reload.db"),10,20))
                    AccountStorageReplay.Need(owner.Current.AccountRevision==1 && owner.Current.WorkshopRevision==1,"Reload published pending group");
                Debug.Log("HWE_ACCOUNT_RELOAD");EditorApplication.Exit(0);
            }
            catch(Exception error){Debug.LogException(error);EditorApplication.Exit(1);}
        };
    }
}
