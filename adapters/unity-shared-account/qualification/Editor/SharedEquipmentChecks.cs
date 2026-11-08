using System;
using System.IO;
using HollowWake.Gameplay;
using HollowWake.Storage;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEditor.SceneManagement;
using UnityEngine;
public static class SharedEquipmentChecks
{
    const string ReloadKey="HollowWake.SharedEquipment.Reload";static int exits;
    public static void VerifyEditor(){SharedEquipmentReplay.Run("editor");Debug.Log("HWE_SHARED_EQUIPMENT_EDITOR");}
    public static void VerifyPublicationFailure(){SharedEquipmentReplay.PublicationFailure();Debug.Log("HWE_SHARED_EQUIPMENT_PUBLICATION_FAILURE");}
    public static void VerifyAndBuild()
    {
        foreach(var type in new[]{typeof(SharedAccountWorkshop),typeof(DurableSharedAccount)})
            SharedEquipmentReplay.Need(UnityEditor.PackageManager.PackageInfo.FindForAssembly(type.Assembly).source==PackageSource.LocalTarball,"Expected actual shared equipment archives");
        SharedEquipmentReplay.Run("editor");var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        new GameObject("Shared equipment qualification").AddComponent<SharedEquipmentReplay>();
        SharedEquipmentReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/SharedEquipment.unity"),"Shared equipment scene save");
        PlayerSettings.companyName="HollowWakeSdkVerification";PlayerSettings.productName="SharedEquipmentPackageTest";
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
        var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions {scenes=new[]{"Assets/SharedEquipment.unity"},locationPathName=Path.Combine(SharedEquipmentReplay.Work,"Built","SharedEquipment.exe"),target=BuildTarget.StandaloneWindows64,options=BuildOptions.StrictMode});
        SharedEquipmentReplay.Need(result.summary.result==BuildResult.Succeeded&&result.summary.totalErrors==0,"Shared equipment player build");
        Debug.Log("HWE_SHARED_EQUIPMENT_BUILT");
    }
    public static void VerifyPlayExit()
    {
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        SharedEquipmentReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/SharedEquipmentLifecycle.unity"),"Shared equipment lifecycle scene");
        EditorSettings.enterPlayModeOptionsEnabled=true;EditorSettings.enterPlayModeOptions=EnterPlayModeOptions.DisableDomainReload;
        EditorApplication.playModeStateChanged+=PlayState;SharedEquipmentReplay.StartLifecycle("play-entry-0");EditorApplication.EnterPlaymode();
    }
    static void PlayState(PlayModeStateChange state)
    {
        try
        {
            if(state==PlayModeStateChange.EnteredPlayMode){SharedEquipmentReplay.EndLifecycle("play-entry-"+exits);SharedEquipmentReplay.StartLifecycle("play-exit-"+exits);EditorApplication.delayCall+=EditorApplication.ExitPlaymode;}
            if(state==PlayModeStateChange.EnteredEditMode)
            {
                SharedEquipmentReplay.EndLifecycle("play-exit-"+exits);
                if(++exits<2){SharedEquipmentReplay.StartLifecycle("play-entry-"+exits);EditorApplication.delayCall+=EditorApplication.EnterPlaymode;}
                else{EditorApplication.playModeStateChanged-=PlayState;Debug.Log("HWE_SHARED_EQUIPMENT_PLAY_EXIT");EditorApplication.Exit(0);}
            }
        }
        catch(Exception error){Debug.LogException(error);EditorApplication.Exit(1);}
    }
    public static void VerifyReload()
    {
        SharedEquipmentReplay.StartLifecycle("reload");SessionState.SetBool(ReloadKey,true);
        AssemblyReloadEvents.beforeAssemblyReload+=()=>SharedEquipmentReplay.EndLifecycle("reload");EditorUtility.RequestScriptReload();
    }
    [InitializeOnLoadMethod] static void AfterReload()
    {
        if(!SessionState.GetBool(ReloadKey,false))return;SessionState.EraseBool(ReloadKey);
        EditorApplication.delayCall+=()=>{
            try
            {
                using(var owner=new DurableSharedAccount(Path.Combine(SharedEquipmentReplay.Work,"reload.db"),10,20,30))
                    SharedEquipmentReplay.Need(owner.Current.Account.Revision==1&&owner.Current.Inventories[0].Revision==1&&owner.Current.Inventories[1].Revision==1,"Reload published shared equipment group");
                Debug.Log("HWE_SHARED_EQUIPMENT_RELOAD");EditorApplication.Exit(0);
            }
            catch(Exception error){Debug.LogException(error);EditorApplication.Exit(1);}
        };
    }
}
