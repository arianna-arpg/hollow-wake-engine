using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class DurableSampleChecks
{
    public static void Build()
    {
        var scene=DurableInventoryScene.Create();
        StorageReplay.Need(Object.FindObjectOfType<DurableInventoryWorkbench>()!=null,"Imported sample scene missing");
        new GameObject("Durable sample verification").AddComponent<DurableSampleReplay>();
        StorageReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/DurableSample.unity"),"Save sample scene");
        PlayerSettings.companyName="HollowWakeSdkVerification";
        PlayerSettings.productName="StorageSampleTest";
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
        var built=BuildPipeline.BuildPlayer(new BuildPlayerOptions {
            scenes=new[]{"Assets/DurableSample.unity"},locationPathName=Path.Combine(StorageReplay.Work,"SampleBuilt","Workshop.exe"),
            target=BuildTarget.StandaloneWindows64,options=BuildOptions.StrictMode
        });
        StorageReplay.Need(built.summary.result==BuildResult.Succeeded && built.summary.totalErrors==0,"Sample build failed");
        Debug.Log("HWE_STORAGE_SAMPLE_BUILT");
    }
}
