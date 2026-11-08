"""Rebuild equipment candidates and challenge archive/qualification metadata admission."""
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
    builder = runpy.run_path(str(base / 'equipment-package.py'))['package']
    bridge = runpy.run_path(str(base / 'verify-equipment-retained.py'))
    archive = runpy.run_path(str(ROOT / 'experiments/embedded-js/patches/unity-cleanup-archive.py'))
    names = ['adapters/unity-shared-account/qualification/' + name for name in
             ['verify-equipment-archives.py', 'verify-equipment-retained.py', 'equipment-package.py', 'equipment-bundle.mjs']]
    names += ['experiments/embedded-js/patches/unity-cleanup-archive.py']
    sources = {name: digest(ROOT / name) for name in names}
    report = dict(passed=False, cleaned=False, sources=sources, controls=[], packages={})
    work = Path(tempfile.mkdtemp(prefix='uer-', dir=ARTIFACTS)).resolve()

    def refused(name, action):
        try:
            action()
        except (AssertionError, FileExistsError):
            report['controls'].append(name)
        else:
            raise AssertionError('Invalid input admitted: ' + name)

    def build(output, gameplay=args.gameplay_parent, storage=args.storage_parent):
        return builder(argparse.Namespace(output=output, gameplay=gameplay, storage=storage))

    try:
        rebuilt = work / 'rebuilt'
        build(rebuilt)
        for name, parent in [('gameplay', args.gameplay_parent), ('storage', args.storage_parent)]:
            original = getattr(args, name)
            receipt = read(original / 'package-receipt.json')
            fresh = read(rebuilt / name / 'package-receipt.json')
            assert fresh == receipt, name
            assert (rebuilt / name / fresh['file']).read_bytes() == (original / receipt['file']).read_bytes(), name
            before = archive['load'](parent)
            after = archive['load'](original / receipt['file'])
            assert set(before) == set(after)
            changed = {file for file in before if before[file] != after[file]}
            allowed = {'package/package.json'} | (
                {'package/Runtime/SharedAccountWorkshop.cs', 'package/Runtime/SharedAccountPackHashes.cs',
                 'package/Runtime/Resources/HollowWake/SharedAccountRules.bytes',
                 'package/Runtime/Resources/HollowWake/SharedAccountContent.bytes'} if name == 'gameplay' else
                {'package/Runtime/GameplayBridge/DurableSharedAccount.cs',
                 'package/Runtime/GameplayBridge/HollowWake.Storage.Gameplay.asmdef'})
            assert changed == allowed, (name, changed)
            report['controls'] += [name + '-exact-rebuild', name + '-preserved-unrelated-files']
            report['packages'][name] = receipt['sha256']
            # Admission verifies every member before deriving the legacy index.
            view = work / (name + '-view')
            result = bridge['candidate_view'](original, view)
            assert result['archiveSha256'] == receipt['sha256']
            assert digest(view / receipt['file']) == receipt['sha256']
            refused(name + '-existing-view', lambda: bridge['candidate_view'](original, view))
        refused('existing-build-output', lambda: build(rebuilt))
        bad_parent = work / 'bad-parent.tgz'
        bad_parent.write_bytes(args.gameplay_parent.read_bytes() + b'changed')
        refused('wrong-gameplay-parent', lambda: build(work / 'bad-gameplay', gameplay=bad_parent))
        bad_parent.write_bytes(args.storage_parent.read_bytes() + b'changed')
        refused('wrong-storage-parent', lambda: build(work / 'bad-storage', storage=bad_parent))
        receipt = read(args.gameplay / 'package-receipt.json')
        bad = work / 'bad-metadata'
        bad.mkdir()
        shutil.copyfile(args.gameplay / receipt['file'], bad / receipt['file'])
        changes = [
            ('wrong-archive-hash', lambda r: r.update(sha256='0' * 64)),
            ('wrong-member-hash', lambda r: r['files'].update({'package/README.md': '0' * 64})),
            ('contradictory-resource-index', lambda r: r.update(hashes={'PouchesContent': '0' * 64})),
            ('changed-sdk-source', lambda r: r['sdkSources'].update({'src/account-workshop-session.ts': '0' * 64})),
        ]
        for name, change in changes:
            damaged = json.loads(json.dumps(receipt))
            change(damaged)
            (bad / 'package-receipt.json').write_text(json.dumps(damaged), encoding='utf-8')
            refused(name, lambda: bridge['candidate_view'](bad, work / name))
        report['passed'] = True
    except BaseException as error:
        report['failure'] = str(error)
        raise
    finally:
        report['inputsUnchanged'] = all(digest(ROOT / name) == sha for name, sha in sources.items())
        report['passed'] = report['passed'] and report['inputsUnchanged']
        try:
            bridge['clean'](work)
            report['cleaned'] = True
        finally:
            args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('gameplay-parent', 'storage-parent', 'gameplay', 'storage', 'output'):
        parser.add_argument('--' + name, type=lambda p: Path(p).resolve(), required=True)
    result = verify(parser.parse_args())
    print(json.dumps({key: result[key] for key in ('passed', 'cleaned', 'inputsUnchanged', 'controls')}))
