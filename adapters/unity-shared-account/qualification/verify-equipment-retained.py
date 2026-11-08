"""Run retained Unity courses against an unchanged equipment candidate archive.

Older runners expect a resource-hash index and frozen inputs beside the archive.
Construct that metadata in an owned scratch view; never edit the candidate receipt
or infer acceptance from a candidate's self-reported qualification flags.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import tarfile
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
ARTIFACTS = (ROOT / '.artifacts').resolve()


def digest(body):
    return hashlib.sha256(body).hexdigest()


def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def clean(work):
    assert work.resolve().parent == ARTIFACTS and work.name.startswith('uer-')
    deadline = time.monotonic() + 20
    while work.exists():
        try:
            # Unity's generated paths can exceed the legacy Windows path limit.
            shutil.rmtree('\\\\?\\' + str(work) if os.name == 'nt' else work)
        except FileNotFoundError:
            if work.exists():
                raise
        except PermissionError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(.25)


def candidate_view(original, target):
    receipt_file = original / 'package-receipt.json'
    receipt = read(receipt_file)
    archive = original / receipt['file']
    assert archive.parent == original and digest(archive.read_bytes()) == receipt['sha256']
    for mapping in ('sources', 'sdkSources', 'nativeSources'):
        for name, expected in receipt.get(mapping, {}).items():
            assert digest((ROOT / name).read_bytes()) == expected, name
    with tarfile.open(archive) as source:
        files = {}
        for member in source:
            assert member.isfile() and member.name not in files, member.name
            files[member.name] = digest(source.extractfile(member).read())
    assert files == receipt['files'], 'Archive member identities differ from the receipt'
    prefix = 'package/Runtime/Resources/HollowWake/'
    hashes = {name[len(prefix):-6]: value for name, value in files.items()
              if name.startswith(prefix) and name.endswith('.bytes')}
    if 'hashes' in receipt:
        assert all(hashes[name] == value for name, value in receipt['hashes'].items())
    receipt['hashes'] = hashes
    receipt['qualificationMetadata'] = dict(
        originalReceiptSha256=digest(receipt_file.read_bytes()),
        resourceHashesDerivedFromVerifiedMembers=True, archiveUnchanged=True)
    target.mkdir()
    shutil.copyfile(archive, target / archive.name)
    (target / 'package-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    return dict(archiveSha256=receipt['sha256'], receiptSha256=digest(receipt_file.read_bytes()),
                supplementalReceiptSha256=digest((target / 'package-receipt.json').read_bytes()),
                resourceHashes=hashes)


def verify(args):
    assert os.name == 'nt' and not args.output.exists()
    assert not Path(str(args.output) + '.raw.json.gz').exists()
    names = [str(Path(__file__).relative_to(ROOT)).replace('\\', '/'),
             'adapters/unity-shared-account/qualification/prepare-public-parent.py']
    if args.mode == 'gameplay':
        names += ['scripts/verify-unity-gameplay.py', 'scripts/prepare-unity-replay.mjs',
                  'scripts/reference-utils.mjs', 'scripts/compile-item-content.mjs',
                  'scripts/compile-passive-content.mjs', 'test/unity-gameplay/content-load.py',
                  'test/unity-gameplay/GameplayReplay.cs', 'test/unity-gameplay/WorkshopReplay.cs',
                  'test/unity-gameplay/Editor/PackageChecks.cs', 'evidence/pouch-recall/dotnet-windows.json']
    sources = {name: digest((ROOT / name).read_bytes()) for name in names}
    work = Path(tempfile.mkdtemp(prefix='uer-', dir=ARTIFACTS)).resolve()
    report = dict(passed=False, cleaned=False, mode=args.mode, sources=sources,
                  physicalDeviceQualification=False, packagePublication=False)
    raw = {}
    try:
        gameplay = work / 'gameplay'
        storage = work / 'storage'
        report['metadata'] = dict(gameplay=candidate_view(args.gameplay, gameplay))
        if args.mode in ('equipment', 'account-storage'):
            report['metadata']['storage'] = candidate_view(args.storage, storage)
        runner_args = argparse.Namespace(editor=args.editor, gameplay=gameplay, storage=storage,
                                         package=gameplay, output=work / 'result.json',
                                         mutations=True, render=False)
        if args.mode == 'shared':
            helper = runpy.run_path(str(ROOT / names[1]))
            inputs = helper['checked']('evidence/prepared-account', 'native-inputs.json.gz')
            fixtures = {name: inputs[name] for name in ('courses.json', 'prepared.json')}
            body = gzip.compress(json.dumps(fixtures).encode(), mtime=0)
            (gameplay / 'qualification-inputs.json.gz').write_bytes(body)
            report['frozenInputsSha256'] = digest(body)
            module = runpy.run_path(str(ROOT / 'adapters/unity-shared-account/qualification/verify.py'))
            report['result'] = module['verify'](args.editor, gameplay, runner_args.output)
        else:
            course = work / 'engine'
            course.mkdir()
            if args.mode == 'gameplay':
                release = work / 'release'
                release.mkdir()
                shutil.copyfile(ROOT / 'evidence/pouch-recall/dotnet-windows.json',
                                release / 'verification-dotnet-windows.json')
                runner_args.release = release
                module = 'scripts/verify-unity-gameplay.py'
            else:
                module = ('scripts/verify-live-equipment-unity.py' if args.mode == 'equipment'
                          else 'scripts/verify-unity-account-storage.py')
            report['result'] = runpy.run_path(str(ROOT / module))['verify'](runner_args, course)
        report['passed'] = True
    except BaseException as error:
        report['failure'] = str(error)
        raise
    finally:
        try:
            report['inputsUnchanged'] = all(digest((ROOT / name).read_bytes()) == sha
                                             for name, sha in sources.items())
            for kind, original in [('gameplay', args.gameplay), ('storage', args.storage)]:
                if kind in report.get('metadata', {}):
                    metadata = report['metadata'][kind]
                    receipt = read(original / 'package-receipt.json')
                    assert digest((original / 'package-receipt.json').read_bytes()) == metadata['receiptSha256']
                    assert digest((original / receipt['file']).read_bytes()) == metadata['archiveSha256']
            existing_raw = Path(str(work / 'result.json') + '.raw.json.gz')
            if existing_raw.exists():
                raw = json.loads(gzip.decompress(existing_raw.read_bytes()))
            else:
                engine = work / 'engine'
                if engine.exists():
                    for course in engine.iterdir():
                        if course.is_dir() and course.name.startswith('run-'):
                            for file in course.iterdir():
                                if file.is_file() and file.suffix in ('.json', '.log', '.replies', '.requests', '.expected'):
                                    raw[file.name] = file.read_text(encoding='utf-8', errors='replace')
            packed = gzip.compress(json.dumps(raw, ensure_ascii=False).encode(), mtime=0)
            Path(str(args.output) + '.raw.json.gz').write_bytes(packed)
            report['rawSha256'] = digest(packed)
            report['passed'] = report['passed'] and report['inputsUnchanged']
        finally:
            try:
                clean(work)
                report['cleaned'] = True
            finally:
                args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['gameplay', 'shared', 'equipment', 'account-storage'], required=True)
    for name in ('editor', 'gameplay', 'storage', 'output'):
        parser.add_argument('--' + name, type=lambda p: Path(p).resolve(), required=True)
    result = verify(parser.parse_args())
    print(json.dumps({key: result[key] for key in ('passed', 'cleaned', 'inputsUnchanged', 'mode')}))
