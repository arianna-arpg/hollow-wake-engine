using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class DurableInventoryScene
{
    public static Scene Create()
    {
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        var camera=new GameObject("Workshop camera").AddComponent<Camera>();
        camera.clearFlags=CameraClearFlags.SolidColor;
        camera.backgroundColor=new Color(0.035f,0.05f,0.075f);
        new GameObject("Durable inventory").AddComponent<DurableInventoryWorkbench>();
        return scene;
    }
    [MenuItem("Hollow Wake/Create durable inventory sample")]
    static void Open()
    {
        if(!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())return;
        var scene=Create();
        EditorSceneManager.SaveScene(scene,AssetDatabase.GenerateUniqueAssetPath("Assets/Durable Inventory.unity"));
    }
}
