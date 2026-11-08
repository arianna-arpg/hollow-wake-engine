using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class AccountSampleChecks
{
    public static void VerifyAndBuild()
    {
        AccountStorageReplay.Need(AssetDatabase.FindAssets("t:MonoScript DurableAccountWorkbench")
            .Select(AssetDatabase.GUIDToAssetPath).Any(path=>path.StartsWith("Assets/Samples/")),"Sample was not imported through Package Manager");
        var scene=DurableAccountScene.Create();
        AccountSampleReplay.Run("sample-editor");
        new GameObject("Sample verification").AddComponent<AccountSampleReplay>();
        AccountStorageReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/AccountSample.unity"),"Sample scene");
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
        var build=BuildPipeline.BuildPlayer(new BuildPlayerOptions {scenes=new[]{"Assets/AccountSample.unity"},
            locationPathName=Path.Combine(AccountStorageReplay.Work,"SampleBuilt","AccountSample.exe"),target=BuildTarget.StandaloneWindows64,
            options=BuildOptions.StrictMode});
        AccountStorageReplay.Need(build.summary.result==BuildResult.Succeeded && build.summary.totalErrors==0,"Sample build");
        Debug.Log("HWE_ACCOUNT_SAMPLE_BUILT");
    }
}
