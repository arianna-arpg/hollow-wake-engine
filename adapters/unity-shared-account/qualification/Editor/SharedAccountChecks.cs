using System.IO;
using HollowWake.Gameplay;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class SharedAccountChecks
{
    public static void VerifyAndBuild()
    {
        SharedAccountReplay.Need(UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(SharedAccountWorkshop).Assembly).source==PackageSource.LocalTarball,"Expected local UPM archive");
        SharedAccountReplay.Run("editor");
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        new GameObject("Shared account verification").AddComponent<SharedAccountReplay>();
        SharedAccountReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/SharedAccount.unity"),"Scene save failed");
        PlayerSettings.companyName="HollowWakeSdkVerification";PlayerSettings.productName="SharedAccountPackageTest";
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
        var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions {scenes=new[]{"Assets/SharedAccount.unity"},
            locationPathName=Path.Combine(SharedAccountReplay.Work,"Built","SharedAccount.exe"),
            target=BuildTarget.StandaloneWindows64,options=BuildOptions.StrictMode});
        SharedAccountReplay.Need(result.summary.result==BuildResult.Succeeded&&result.summary.totalErrors==0,"Player build failed");
        Debug.Log("HWE_SHARED_ACCOUNT_BUILT");
    }
}
