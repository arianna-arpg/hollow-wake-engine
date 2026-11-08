using System.IO;
using System.Linq;
using HollowWake.Gameplay;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.UI;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class ProgressionChecks
{
    public static void ImportSample()
    {
        var info=UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(AccountProgression).Assembly);
        ProgressionReplay.Need(info.source==PackageSource.LocalTarball,"Expected actual UPM archive");
        var sample=Sample.FindByPackage(info.name,info.version).Single();
        ProgressionReplay.Need(sample.Import(Sample.ImportOptions.OverridePreviousImports),"Sample import failed");
        Debug.Log("HWE_PROGRESSION_IMPORTED");
    }
    public static void VerifyAndBuild()
    {
        ProgressionReplay.Need(UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(AccountProgression).Assembly).source==PackageSource.LocalTarball,"Expected actual UPM archive");
        ProgressionReplay.Run("editor");
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        new GameObject("Account progression verification").AddComponent<ProgressionReplay>();
        ProgressionReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/Progression.unity"),"Scene save failed");
        PlayerSettings.companyName="HollowWakeSdkVerification";PlayerSettings.productName="ProgressionPackageTest";
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
        var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{"Assets/Progression.unity"},
            locationPathName=Path.Combine(ProgressionReplay.Work,"Built","Progression.exe"),
            target=BuildTarget.StandaloneWindows64,options=BuildOptions.StrictMode});
        ProgressionReplay.Need(result.summary.result==BuildResult.Succeeded && result.summary.totalErrors==0,"Player build failed");
        Debug.Log("HWE_PROGRESSION_BUILT");
    }
}
