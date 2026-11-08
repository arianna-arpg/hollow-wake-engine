using System.IO;
using HollowWake.Storage;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEditor.SceneManagement;
using UnityEngine;
public static class SharedStorageChecks
{
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
}
