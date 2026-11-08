using System;
using System.IO;
using System.Linq;
using HollowWake.Storage;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class StorageChecks
{
    public static void ImportSample()
    {
        var info=UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(UnitySaveStore).Assembly);
        var sample=UnityEditor.PackageManager.UI.Sample.FindByPackage(info.name,info.version).Single(row=>row.displayName=="Durable Inventory");
        StorageReplay.Need(sample.Import(UnityEditor.PackageManager.UI.Sample.ImportOptions.OverridePreviousImports),"Storage sample import failed");
        AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
        Debug.Log("HWE_STORAGE_SAMPLE_IMPORTED");
    }
    const string Package="com.hollowwake.storage";
    const string ReloadKey="HollowWake.Storage.Verification.Reload";
    static UnitySaveStore held;
    static int exits;
    public static void VerifyWorkshopFault()
    {
        StorageReplay.Need(StorageReplay.WorkshopContracts!=null,"Workshop fault course not registered");
        StorageReplay.WorkshopContracts("fault");
        Debug.Log("HWE_STORAGE_FAULT_SURVIVED");
    }
    public static void VerifyAndBuild()
    {
        var info=UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(UnitySaveStore).Assembly);
        StorageReplay.Need(info!=null && info.name==Package && info.source==PackageSource.LocalTarball,"Expected actual storage tarball");
        bool combined=Environment.GetEnvironmentVariable("HWE_STORAGE_GAMEPLAY")=="1";
        StorageReplay.Need(AppDomain.CurrentDomain.GetAssemblies().Any(a=>a.GetName().Name=="HollowWake.Gameplay")==combined,"Unexpected gameplay assembly presence");
        StorageReplay.Need(AppDomain.CurrentDomain.GetAssemblies().Any(a=>a.GetName().Name=="HollowWake.Storage.Gameplay")==combined,"Unexpected optional bridge assembly presence");
        StorageReplay.Need((StorageReplay.WorkshopContracts!=null)==combined,"Workshop course registration differs");
        var importer=(PluginImporter)AssetImporter.GetAtPath("Packages/"+Package+"/Runtime/Native/Windows/hwe_save.dll");
        StorageReplay.Need(importer!=null && importer.GetCompatibleWithEditor() &&
            importer.GetCompatibleWithPlatform(BuildTarget.StandaloneWindows64) &&
            !importer.GetCompatibleWithAnyPlatform() && !importer.GetCompatibleWithPlatform(BuildTarget.Android) &&
            !importer.GetCompatibleWithPlatform(BuildTarget.StandaloneLinux64) &&
            !importer.GetCompatibleWithPlatform(BuildTarget.StandaloneWindows) &&
            !importer.GetCompatibleWithPlatform(BuildTarget.StandaloneOSX) &&
            importer.GetEditorData("OS")=="Windows" && importer.GetEditorData("CPU")=="x86_64","Storage importer mismatch");
        StorageReplay.Contracts("editor");
        StorageReplay.WorkshopContracts?.Invoke("editor");
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        new GameObject("Storage contracts").AddComponent<StorageReplay>();
        StorageReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/StorageTest.unity"),"Save replay scene");
        PlayerSettings.companyName="HollowWakeSdkVerification";
        PlayerSettings.productName="StoragePackageTest";
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
        var build=BuildPipeline.BuildPlayer(new BuildPlayerOptions {
            scenes=new[]{"Assets/StorageTest.unity"},locationPathName=Path.Combine(StorageReplay.Work,"Built","Storage.exe"),
            target=BuildTarget.StandaloneWindows64,options=BuildOptions.StrictMode
        });
        StorageReplay.Need(build.summary.result==BuildResult.Succeeded && build.summary.totalErrors==0,"Storage player build failed");
        Debug.Log("HWE_STORAGE_BUILT");
    }
    public static void VerifyPlayExit()
    {
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        StorageReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/ExitTest.unity"),"Save lifecycle scene");
        EditorSettings.enterPlayModeOptionsEnabled=true;
        EditorSettings.enterPlayModeOptions=EnterPlayModeOptions.DisableDomainReload;
        EditorApplication.playModeStateChanged+=PlayState;
        StorageReplay.WorkshopLifecycleStart?.Invoke("play-entry-0");
        EditorApplication.EnterPlaymode();
    }
    static void PlayState(PlayModeStateChange state)
    {
        try
        {
            if(state==PlayModeStateChange.EnteredPlayMode)
            {
                StorageReplay.WorkshopLifecycleEnd?.Invoke("play-entry-"+exits);
                held=StorageReplay.Open("play-exit-"+exits+".db");
                StorageReplay.Need(held.Store.Stage(1,0,StorageReplay.Body,StorageReplay.Stash).Succeeded,"Stage play-exit transaction");
                StorageReplay.WorkshopLifecycleStart?.Invoke("play-exit-"+exits);
                EditorApplication.delayCall+=EditorApplication.ExitPlaymode;
            }
            if(state==PlayModeStateChange.EnteredEditMode && held!=null)
            {
                StorageReplay.Need(held.IsDisposed,"Play exit retained native store");
                StorageReplay.WorkshopLifecycleEnd?.Invoke("play-exit-"+exits);
                using(var observer=StorageReplay.Open("play-exit-"+exits+".db"))
                    StorageReplay.Need(observer.Store.Read(1).IsEmpty,"Play exit committed staged work");
                held=null;
                if(++exits<2)
                {
                    StorageReplay.WorkshopLifecycleStart?.Invoke("play-entry-"+exits);
                    EditorApplication.delayCall+=EditorApplication.EnterPlaymode;
                }
                else
                {
                    var result=StorageReplay.NewResult("play-exit");result.passed=result.closed=true;result.revision=exits;StorageReplay.Write(result);
                    EditorApplication.playModeStateChanged-=PlayState;
                    Debug.Log("HWE_STORAGE_PLAY_EXIT");EditorApplication.Exit(0);
                }
            }
        }
        catch(Exception error) { Debug.LogException(error);EditorApplication.Exit(1); }
    }
    public static void VerifyReload()
    {
        held=StorageReplay.Open("reload.db");
        StorageReplay.Need(held.Store.Stage(1,0,StorageReplay.Body,StorageReplay.Stash).Succeeded,"Stage reload transaction");
        StorageReplay.WorkshopLifecycleStart?.Invoke("reload");
        SessionState.SetBool(ReloadKey,true);
        AssemblyReloadEvents.beforeAssemblyReload+=()=>{
            StorageReplay.WorkshopLifecycleEnd?.Invoke("reload");
            var result=StorageReplay.NewResult("before-reload");result.passed=result.closed=held.IsDisposed;StorageReplay.Write(result);
        };
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
                using(var owner=StorageReplay.Open("reload.db"))StorageReplay.Need(owner.Store.Read(1).IsEmpty,"Reload committed staged work");
                var result=StorageReplay.NewResult("after-reload");result.passed=true;StorageReplay.Write(result);
                Debug.Log("HWE_STORAGE_RELOAD");EditorApplication.Exit(0);
            }
            catch(Exception error) { Debug.LogException(error);EditorApplication.Exit(1); }
        };
    }
}
