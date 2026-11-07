"""Deliberate bridge defects must fail the real Unity workshop course."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import runpy
import subprocess
import tarfile


def controls(root, archive, project, work, env, editor):
    original=hashlib.sha256(archive.read_bytes()).hexdigest()
    stage=work/"fault-package"
    stage.mkdir()
    with tarfile.open(archive,"r:gz") as source:
        for item in source.getmembers():
            name=PurePosixPath(item.name)
            assert item.isfile() and name.parts[0]=="package" and ".." not in name.parts
            if item.name.endswith(".meta"):
                continue
            target=stage.joinpath(*name.parts[1:])
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(source.extractfile(item).read())
    file=stage/"Runtime/GameplayBridge/DurableWorkshop.cs"
    good=file.read_text(encoding="utf-8")
    variants=[
        ("early-publication","ticket=submitted.Value;",
         "ticket=submitted.Value;Snapshot=candidateSnapshot;StashJson=candidateStash;",
         "Initial profile published early"),
        ("failed-commit-publication","if(!result.Succeeded) { Discard();return StorageRefused(result); }",
         "if(!result.Succeeded) { Snapshot=candidateSnapshot;Discard();return StorageRefused(result); }",
         "Busy writer changed visible state"),
    ]
    manifest=project/"Packages/manifest.json"
    retained=manifest.read_text(encoding="utf-8")
    proofs=[]
    try:
        for name,before,after,expected in variants:
            assert good.count(before)==1
            file.write_text(good.replace(before,after),encoding="utf-8")
            packed=project/"Packages"/("fault-"+name+".tgz")
            runpy.run_path(str(root/"scripts/unity-package-archive.py"))["package"](stage,packed)
            dependency=json.loads(retained)
            dependency["dependencies"]["com.hollowwake.storage"]="file:"+packed.name
            manifest.write_text(json.dumps(dependency),encoding="utf-8")
            course=work/("fault-"+name)
            course.mkdir()
            log=course/"editor.log"
            result=subprocess.run([str(editor),"-batchmode","-nographics","-quit","-projectPath",str(project),
                                   "-logFile",str(log),"-executeMethod","StorageChecks.VerifyWorkshopFault"],
                                  cwd=course,env={**env,"HWE_STORAGE_WORK":str(course)},timeout=420,
                                  creationflags=subprocess.CREATE_NO_WINDOW)
            lines=log.read_text(encoding="utf-8",errors="replace")
            assert result.returncode!=0 and expected in lines, (name,result.returncode,expected)
            assert "error CS" not in lines and "HWE_STORAGE_FAULT_SURVIVED" not in lines, name
            proofs.append(dict(name=name,rejected=True,expectedFailure=expected,exitCode=result.returncode,
                               packageSha256=hashlib.sha256(packed.read_bytes()).hexdigest(),
                               sourceSha256=hashlib.sha256(file.read_bytes()).hexdigest(),
                               logSha256=hashlib.sha256(log.read_bytes()).hexdigest()))
    finally:
        manifest.write_text(retained,encoding="utf-8")
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==original
    return dict(passed=True,originalArchiveUnchanged=True,acceptedPackageSha256=original,cases=proofs)
