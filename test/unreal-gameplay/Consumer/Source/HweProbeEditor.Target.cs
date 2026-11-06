using UnrealBuildTool;

public class HweProbeEditorTarget : TargetRules
{
    public HweProbeEditorTarget(TargetInfo target) : base(target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V2;
        ExtraModuleNames.Add("HweProbe");
    }
}
