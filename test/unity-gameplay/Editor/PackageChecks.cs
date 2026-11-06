using System;
using System.IO;
using System.Linq;
using HollowWake.Gameplay;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.UI;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class PackageChecks
{
    const string Package = "com.hollowwake.gameplay";
    public static void ImportSample()
    {
        var info = UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(GameplayHost).Assembly);
        GameplayReplay.Need(info != null && info.name == Package && info.source == PackageSource.LocalTarball,
            "Expected installation from the actual UPM tarball");
        var sample = Sample.FindByPackage(info.name,info.version).Single();
        GameplayReplay.Need(sample.Import(Sample.ImportOptions.OverridePreviousImports), "Sample import failed");
        Debug.Log("HWE_SAMPLE_IMPORTED");
    }
    public static void VerifyAndBuild()
    {
        var importer = (PluginImporter)AssetImporter.GetAtPath("Packages/" + Package + "/Runtime/Native/Windows/hwe_embedded.dll");
        GameplayReplay.Need(importer != null && importer.GetCompatibleWithEditor() && importer.GetCompatibleWithPlatform(BuildTarget.StandaloneWindows64)
            && !importer.GetCompatibleWithAnyPlatform() && !importer.GetCompatibleWithPlatform(BuildTarget.Android)
            && !importer.GetCompatibleWithPlatform(BuildTarget.StandaloneLinux64) && !importer.GetCompatibleWithPlatform(BuildTarget.StandaloneWindows)
            && !importer.GetCompatibleWithPlatform(BuildTarget.StandaloneOSX) && importer.GetEditorData("OS")=="Windows"
            && importer.GetEditorData("CPU")=="x86_64","Native importer platform mismatch: Linux="+importer.GetCompatibleWithPlatform(BuildTarget.StandaloneLinux64)
            +", macOS="+importer.GetCompatibleWithPlatform(BuildTarget.StandaloneOSX)+", Windows="+importer.GetCompatibleWithPlatform(BuildTarget.StandaloneWindows64));
        var result = GameplayReplay.Run("editor");
        GameplayReplay.Receipt(result);
        var source = AssetDatabase.FindAssets("Ruin Encounter t:Scene",new[]{"Assets/Samples"}).Select(AssetDatabase.GUIDToAssetPath).Single();
        var scene = EditorSceneManager.OpenScene(source);
        var component=GameObject.Find("Ruin encounter").GetComponent("CastingAndBurning");
        GameplayReplay.Need(component!=null && (TextAsset)component.GetType().GetField("build").GetValue(component)!=null,
            "Imported scene lost its script or serialized build reference");
        PlayerSettings.companyName="HollowWakeSdkVerification";
        PlayerSettings.productName="GameplayPackageTest";
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone,ScriptingImplementation.Mono2x);
        string player = Path.Combine(GameplayReplay.Work,"Built","Gameplay.exe");
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[]{scene.path},
            locationPathName = player,target=BuildTarget.StandaloneWindows64,options=BuildOptions.StrictMode });
        GameplayReplay.Need(report.summary.result==BuildResult.Succeeded && report.summary.totalErrors==0,
            "Unity player build failed: "+report.summary.result+" errors="+report.summary.totalErrors);
        Debug.Log("HWE_UNITY_BUILT");
    }
    static GameplayHost playHost;
    static int exits;
    public static void VerifyPlayExit()
    {
        // Only the disposable acceptance project is passed to this method.
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        GameplayReplay.Need(EditorSceneManager.SaveScene(scene,"Assets/PlayExit.unity"),"Saving empty play scene");
        EditorSettings.enterPlayModeOptionsEnabled=true;
        EditorSettings.enterPlayModeOptions=EnterPlayModeOptions.DisableDomainReload;
        EditorApplication.playModeStateChanged+=OnPlayState;
        EditorApplication.EnterPlaymode();
    }
    static void OnPlayState(PlayModeStateChange state)
    {
        try
        {
            if(state==PlayModeStateChange.EnteredPlayMode)
            {
                playHost=GameplayHost.OpenMemoryPouches();
                GameplayReplay.Need(playHost.Execute("{\"op\":\"validate\",\"memory\":null}").Contains("true"),"Play host not active");
                EditorApplication.delayCall+=EditorApplication.ExitPlaymode;
            }
            if(state==PlayModeStateChange.EnteredEditMode && playHost!=null)
            {
                GameplayReplay.Need(playHost.IsClosed && playHost.FinalMetrics.LiveBytes==0 && playHost.FinalMetrics.LiveBlocks==0,"Play-mode exit leaked a native host");
                playHost=null;
                if(++exits<2)EditorApplication.delayCall+=EditorApplication.EnterPlaymode;
                else
                {
                    EditorApplication.playModeStateChanged-=OnPlayState;
                    Debug.Log("HWE_PLAY_EXIT_VERIFIED");
                    EditorApplication.Exit(0);
                }
            }
        }
        catch(Exception error){Debug.LogException(error);EditorApplication.Exit(1);}
    }
    public static void VerifyCorruption()
    {
        bool refused=false;
        try { using(var ignored=GameplayHost.OpenMemoryPouches()){} }
        catch(InvalidOperationException error){refused=error.Message.Contains("Mismatched Hollow Wake asset PouchesContent");}
        GameplayReplay.Need(refused,"Changed pouch content was accepted or failed for a different reason");
        using(var combat=GameplayHost.OpenCombat())
            GameplayReplay.Need(combat.ReadMetrics().LiveBytes>0,"Independent combat content failed to open");
        Debug.Log("HWE_DAMAGED_POUCH_REJECTED");
    }
}
