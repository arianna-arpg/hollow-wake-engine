using UnrealBuildTool;

public class HweProbeTarget : TargetRules
{
    public HweProbeTarget(TargetInfo target) : base(target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V2;
        ExtraModuleNames.Add("HweProbe");
    }
}
