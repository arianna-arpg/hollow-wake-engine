using System.IO;
using HollowWake.Gameplay;
using HollowWake.Storage;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class EquipmentChecks
{
    public static void VerifyAndBuild()
    {
        foreach(var assembly in new[]{typeof(CombatWorld).Assembly,typeof(UnitySaveStore).Assembly})
            EquipmentReplay.Need(UnityEditor.PackageManager.PackageInfo.FindForAssembly(assembly).source==PackageSource.LocalTarball,"Expected actual UPM archives");
        EquipmentReplay.Run("editor");
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        new GameObject("Equipment publication").AddComponent<EquipmentReplay>();
        EquipmentReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/Equipment.unity"),"Scene save failed");
        PlayerSettings.companyName="HollowWakeSdkVerification";PlayerSettings.productName="EquipmentPackageTest";
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
        var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{"Assets/Equipment.unity"},
            locationPathName=Path.Combine(EquipmentReplay.Work,"Built","Equipment.exe"),
            target=BuildTarget.StandaloneWindows64,options=BuildOptions.StrictMode});
        EquipmentReplay.Need(result.summary.result==BuildResult.Succeeded && result.summary.totalErrors==0,"Player build failed");
        Debug.Log("HWE_EQUIPMENT_BUILT");
    }
}
