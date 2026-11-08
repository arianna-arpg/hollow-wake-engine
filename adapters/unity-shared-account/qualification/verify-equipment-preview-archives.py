"""Reproduce previews and prove their runtime boundary is identical to the qualified candidates."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[3]
ARTIFACTS = (ROOT / '.artifacts').resolve()


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def read(file):
    return json.loads(file.read_text(encoding='utf-8'))


def verify(args):
    assert not args.output.exists()
    base = ROOT / 'adapters/unity-shared-account/qualification'
    builder = runpy.run_path(str(base / 'package-equipment-preview.py'))['packages']
    loader = runpy.run_path(str(ROOT / 'experiments/embedded-js/patches/unity-cleanup-archive.py'))['load']
    clean = runpy.run_path(str(base / 'verify-equipment-retained.py'))['clean']
    names = ['adapters/unity-shared-account/qualification/' + name for name in [
        'verify-equipment-preview-archives.py', 'package-equipment-preview.py', 'verify-equipment-retained.py']]
    names += ['experiments/embedded-js/patches/unity-cleanup-archive.py']
    report = dict(passed=False, cleaned=False, controls=[], packages={}, sources={name: digest(ROOT / name) for name in names})
    work = Path(tempfile.mkdtemp(prefix='uer-', dir=ARTIFACTS)).resolve()

    def refuse(name, action):
        try:
            action()
        except (AssertionError, FileExistsError):
            report['controls'].append(name)
        else:
            raise AssertionError('Invalid input admitted: ' + name)

    try:
        rebuilt = work / 'rebuilt'
        builder(args.candidate, rebuilt)
        for name, version in [('gameplay', '0.6.0-preview.1'), ('storage', '0.5.0-preview.1')]:
            prior = read(args.candidate / name / 'package-receipt.json')
            expected = read(args.preview / name / 'package-receipt.json')
            fresh = read(rebuilt / name / 'package-receipt.json')
            assert fresh == expected, name
            original = args.preview / name / expected['file']
            assert (rebuilt / name / fresh['file']).read_bytes() == original.read_bytes()
            before, after = loader(args.candidate / name / prior['file']), loader(original)
            assert sorted(file for file in before if before[file] != after[file]) == ['package/README.md', 'package/package.json']
            assert set(after) - set(before) == {'package/Documentation~/SharedEquipment.md'}
            runtime = [file for file in before if file.startswith('package/Runtime/')]
            assert runtime and all(before[file] == after[file] for file in runtime)
            assert expected['runtimeIdenticalToCandidate'] and len(runtime) == expected['preservedRuntimeFiles']
            old_manifest, new_manifest = [json.loads(entries['package/package.json']) for entries in [before, after]]
            assert new_manifest.pop('version') == version
            new_manifest.pop('documentationUrl')
            old_manifest.pop('version');old_manifest.pop('documentationUrl', None)
            assert old_manifest == new_manifest
            assert all(before[file] == after[file] for file in before if file.endswith('.meta') or file.startswith('package/Samples~/'))
            report['controls'] += [name + '-exact-rebuild', name + '-identical-runtime', name + '-preserved-samples-and-guids']
            report['packages'][name] = expected
        refuse('existing-output', lambda: builder(args.candidate, rebuilt))
        bad = work / 'bad-candidate'
        (bad / 'gameplay').mkdir(parents=True)
        receipt = read(args.candidate / 'gameplay/package-receipt.json')
        (bad / 'gameplay/package-receipt.json').write_text(json.dumps(receipt), encoding='utf-8')
        archive = bad / 'gameplay' / receipt['file']
        archive.write_bytes((args.candidate / 'gameplay' / receipt['file']).read_bytes() + b'changed')
        refuse('altered-candidate-archive', lambda: builder(bad, work / 'wrong-archive'))
        shutil.copyfile(args.candidate / 'gameplay' / receipt['file'], archive)
        receipt['files']['package/Runtime/SharedAccountWorkshop.cs'] = '0' * 64
        (bad / 'gameplay/package-receipt.json').write_text(json.dumps(receipt), encoding='utf-8')
        refuse('altered-candidate-receipt', lambda: builder(bad, work / 'wrong-receipt'))
        assert not (work / 'wrong-archive').exists() and not (work / 'wrong-receipt').exists()
        report['passed'] = True
    except BaseException as error:
        report['failure'] = str(error)
        raise
    finally:
        report['inputsUnchanged'] = all(digest(ROOT / name) == sha for name, sha in report['sources'].items())
        report['passed'] = report['passed'] and report['inputsUnchanged']
        try:
            clean(work)
            report['cleaned'] = True
        finally:
            args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['candidate', 'preview', 'output']:
        parser.add_argument('--' + name, type=lambda p: Path(p).resolve(), required=True)
    result = verify(parser.parse_args())
    print(json.dumps({key: result[key] for key in ['passed', 'cleaned', 'inputsUnchanged', 'controls']}))
