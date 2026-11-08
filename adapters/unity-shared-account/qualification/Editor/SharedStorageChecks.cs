using System;
using System.IO;
using HollowWake.Storage;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEditor.SceneManagement;
using UnityEngine;
public static class SharedStorageChecks
{
    const string ReloadKey="HollowWake.SharedStorage.Reload";
    static int exits;
    public static void VerifyAndBuild()
    {
        SharedStorageReplay.Need(UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(DurableSharedAccount).Assembly).source==PackageSource.LocalTarball,"Expected storage UPM archive");
        SharedStorageReplay.Run("editor");var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        new GameObject("Shared storage verification").AddComponent<SharedStorageReplay>();
        SharedStorageReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/SharedStorage.unity"),"Scene save failed");
        PlayerSettings.companyName="HollowWakeSdkVerification";PlayerSettings.productName="SharedStoragePackageTest";
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
        var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions {scenes=new[]{"Assets/SharedStorage.unity"},locationPathName=Path.Combine(SharedStorageReplay.Work,"Built","SharedStorage.exe"),target=BuildTarget.StandaloneWindows64,options=BuildOptions.StrictMode});
        SharedStorageReplay.Need(result.summary.result==BuildResult.Succeeded&&result.summary.totalErrors==0,"Player build failed");Debug.Log("HWE_SHARED_STORAGE_BUILT");
    }
    public static void VerifyPlayExit()
    {
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        SharedStorageReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/SharedLifecycle.unity"),"Shared lifecycle scene");
        EditorSettings.enterPlayModeOptionsEnabled=true;EditorSettings.enterPlayModeOptions=EnterPlayModeOptions.DisableDomainReload;
        EditorApplication.playModeStateChanged+=PlayState;
        SharedStorageReplay.StartLifecycle("play-entry-0");EditorApplication.EnterPlaymode();
    }
    static void PlayState(PlayModeStateChange state)
    {
        try
        {
            if(state==PlayModeStateChange.EnteredPlayMode)
            {
                SharedStorageReplay.EndLifecycle("play-entry-"+exits);SharedStorageReplay.StartLifecycle("play-exit-"+exits);
                EditorApplication.delayCall+=EditorApplication.ExitPlaymode;
            }
            if(state==PlayModeStateChange.EnteredEditMode)
            {
                SharedStorageReplay.EndLifecycle("play-exit-"+exits);
                if(++exits<2){SharedStorageReplay.StartLifecycle("play-entry-"+exits);EditorApplication.delayCall+=EditorApplication.EnterPlaymode;}
                else {EditorApplication.playModeStateChanged-=PlayState;Debug.Log("HWE_SHARED_PLAY_EXIT");EditorApplication.Exit(0);}
            }
        }
        catch(Exception error){Debug.LogException(error);EditorApplication.Exit(1);}
    }
    public static void VerifyReload()
    {
        SharedStorageReplay.StartLifecycle("reload");SessionState.SetBool(ReloadKey,true);
        AssemblyReloadEvents.beforeAssemblyReload+=()=>SharedStorageReplay.EndLifecycle("reload");EditorUtility.RequestScriptReload();
    }
    [InitializeOnLoadMethod]
    static void AfterReload()
    {
        if(!SessionState.GetBool(ReloadKey,false))return;SessionState.EraseBool(ReloadKey);
        EditorApplication.delayCall+=()=>{
            try
            {
                using(var owner=new DurableSharedAccount(Path.Combine(SharedStorageReplay.Work,"reload.db"),10,20,30))
                    SharedStorageReplay.Need(owner.Current.Account.Revision==1&&owner.Current.Inventories[0].Revision==1&&owner.Current.Inventories[1].Revision==1,"Reload published shared pending group");
                Debug.Log("HWE_SHARED_RELOAD");EditorApplication.Exit(0);
            }
            catch(Exception error){Debug.LogException(error);EditorApplication.Exit(1);}
        };
    }
}
