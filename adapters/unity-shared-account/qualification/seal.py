"""Seal completed local qualification without publishing workstation Unity logs."""
import argparse,gzip,hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def sha(body):return hashlib.sha256(body).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))
def compact(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
def seal(args):
    assert not args.output.exists()
    names=['typed','sharedStorage','progression','equipment','accountStorage','retained','standalone','faults','archives']
    files=read(args.inputs);assert set(files)==set(names)
    reports={};observations={};sources={}
    def merge(mapping):
        for name,digest in mapping.items():
            assert not name.startswith('/') and ':' not in name and '..' not in Path(name).parts
            assert sha((ROOT/name).read_bytes())==digest,name
            if name in sources:assert sources[name]==digest,name
            sources[name]=digest
    for name in names:
        file=(ROOT/files[name]).resolve();assert file.parent==ROOT/'.artifacts' or file.parent.parent==ROOT/'.artifacts'
        report=read(file);assert report['passed'] and report.get('cleaned',name=='equipment'),name
        assert report.get('inputsUnchanged',True),name
        reports[name]=report;merge(report['sources'])
        if name=='archives':continue
        rawfile=file.with_name('raw.json.gz') if name=='faults' else Path(str(file)+'.raw.json.gz')
        body=rawfile.read_bytes();assert sha(body)==report['rawSha256'],name
        raw=json.loads(gzip.decompress(body))
        if name=='faults':
            clean={}
            for fault in report['faults']:
                row=raw[fault['name']];assert row['status']!=0 and not row['report']['passed']
                lines=[line for text in row['observations'].values() for line in text.splitlines() if line.startswith('Exception: '+fault['assertion'])]
                assert lines,fault['name']
                clean[fault['name']]=dict(report=row['report'],status=row['status'],assertions=lines)
            observations[name]=clean
            observations['faultControl']={key:value for key,value in raw['control']['observations'].items() if not key.endswith('.log')}
        else:
            clean={key:value for key,value in raw.items() if not key.endswith('.log')}
            if name=='accountStorage':
                clean['faultAssertions']={fault['name']:[line for key,text in raw.items() if key.endswith('.log') for line in text.splitlines() if line.startswith('Exception: '+fault['assertion'])] for fault in report['faults']}
                assert all(clean['faultAssertions'].values())
            observations[name]=clean
    gameplay=reports['typed']['package'];storage=reports['sharedStorage']['packages']['storage']
    for pack in [gameplay,storage]:merge(pack['sources'])
    merge(gameplay['sdkSources'])
    for name in ['adapters/unity-shared-account/qualification/seal.py','scripts/check-unity-shared-account-evidence.mjs']:
        sources[name]=sha((ROOT/name).read_bytes())
    assert len(args.source_ref)==40 and all(c in '0123456789abcdef' for c in args.source_ref)
    # A receipt refers to real committed source, not merely copied expected hashes.
    for name,digest in sources.items():
        assert sha(subprocess.check_output(['git','show',args.source_ref+':'+name],cwd=ROOT))==digest,name
    accepted=dict(schemaVersion=1,passed=True,sourceCommit=args.source_ref,
        scope='Unity 2021.3.6f1 Windows x64 Editor and relocated Mono player; selected packaged capabilities',
        physicalDeviceQualification=False,completeSdkQualification=False,
        gameplaySha256=gameplay['sha256'],storageSha256=storage['sha256'],sources=sources,
        preparedEvidenceSha256=sha((ROOT/'evidence/prepared-account/acceptance.json').read_bytes()),
        parentEvidenceSha256=sha((ROOT/'evidence/unity-runtime-cleanup/acceptance.json').read_bytes()))
    args.output.mkdir()
    for name,value in [('reports.json.gz',reports),('observations.json.gz',observations)]:
        (args.output/name).write_bytes(gzip.compress(compact(value),mtime=0))
    accepted['files']={name:sha((args.output/name).read_bytes()) for name in ['reports.json.gz','observations.json.gz']}
    (args.output/'acceptance.json').write_text(json.dumps(accepted,indent=2)+'\n',encoding='utf-8')
    return accepted
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--inputs',type=Path,required=True);parser.add_argument('--source-ref',required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();args.output=args.output.resolve();result=seal(args)
    print(json.dumps(dict(passed=True,gameplay=result['gameplaySha256'],storage=result['storageSha256'],sources=len(result['sources']))))
