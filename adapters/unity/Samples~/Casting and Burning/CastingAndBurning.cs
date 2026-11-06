using UnityEngine;
using HollowWake.Gameplay;

/// <summary>Attach to an active GameObject. The inspector's context menu
/// exposes Press Cast during Play mode. This sample authorizes one stationary
/// contact and a 10-DPS Burning application when the spell completes.</summary>
public sealed class CastingAndBurning : MonoBehaviour
{
    [Tooltip("Assign the sample's Magician.json or your own admitted character and skill build.")]
    public TextAsset build;
    public double lastHit, targetLife;
    public string lastCast;
    CombatWorld world;
    CombatWorld.Actor actor;
    bool defeated;

    void OnEnable()
    {
        if (!build) build = Resources.Load<TextAsset>("HollowWakeSample/Magician");
        if (!build) { Debug.LogError("Assign a character build to CastingAndBurning.", this); return; }
        defeated = false;
        world = new CombatWorld();
        try
        {
            actor = world.CreateActor(build.text);
            lastHit = 0; lastCast = "";
            targetLife = actor.Advance(0).targetLife;
        }
        catch { world.Dispose(); world = null; throw; }
    }
    [ContextMenu("Press Cast")]
    public void PressCast()
    {
        if (actor == null || defeated) return;
        Observe(actor.Press());
    }
    void FixedUpdate()
    {
        if (actor == null || defeated) return;
        var frame = actor.Advance(Time.fixedDeltaTime);
        targetLife = frame.targetLife;
        defeated = targetLife <= 0;
        if (frame.cast != null && !string.IsNullOrEmpty(frame.cast.kind)) Observe(frame.cast);
    }
    void OnGUI()
    {
        if(actor==null)return;
        GUILayout.BeginArea(new Rect(20,20,280,180),GUI.skin.box);
        GUILayout.Label("Ruin · Magician");
        GUILayout.Label("Target life   " + System.Math.Max(0,targetLife).ToString("F1"));
        GUILayout.Label("Last hit   " + lastHit.ToString("F1"));
        if(!string.IsNullOrEmpty(lastCast))GUILayout.Label("Cast   "+lastCast);
        if(!defeated && GUILayout.Button("Cast Ruin"))PressCast();
        if(defeated && GUILayout.Button("Restart encounter")){OnDisable();OnEnable();}
        GUILayout.EndArea();
    }
    void Observe(CombatWorld.Cast cast)
    {
        lastCast = cast.kind;
        if (cast.kind != "completed" || defeated) return;
        var hit = actor.ResolveContact();
        lastHit = hit.damage;
        targetLife = hit.life;
        defeated = targetLife <= 0;
        if (targetLife > 0) actor.ApplyTimedDamage(10);
    }
    void OnDisable()
    {
        try { actor?.Dispose(); }
        finally { world?.Dispose(); actor = null; world = null; }
    }
}
