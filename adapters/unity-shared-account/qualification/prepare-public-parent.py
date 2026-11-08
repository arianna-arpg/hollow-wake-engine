"""Materialize public package metadata and frozen qualification inputs; never regenerate expectations."""
import argparse,gzip,hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]

def digest(body):return hashlib.sha256(body).hexdigest()

def checked(folder,name):
    accepted=json.loads((ROOT/folder/'acceptance.json').read_text(encoding='utf-8'))
    body=(ROOT/folder/name).read_bytes();assert accepted['passed'] and digest(body)==accepted['files'][name]
    return json.loads(gzip.decompress(body))

def prepare(archive,output):
    assert output.parent==(ROOT/'.artifacts').resolve() and not output.exists()
    receipt=checked('evidence/unity-shared-account','reports.json.gz')['typed']['package']
    assert receipt['sha256']=='a34b721bc3cc4649e28a33fe1821d30b508884f0d3b43f659008a2a1305df44c'
    assert digest(archive.read_bytes())==receipt['sha256']
    inputs=checked('evidence/prepared-account','native-inputs.json.gz')
    fixtures={name:inputs[name] for name in ['courses.json','prepared.json']}
    assert sum(len(course['rows']) for course in json.loads(fixtures['courses.json']))==579
    assert sum(len(course['rows']) for course in json.loads(fixtures['prepared.json']))==84
    output.mkdir()
    shutil.copyfile(archive,output/receipt['file'])
    (output/'package-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8',newline='\n')
    body=gzip.compress(json.dumps(fixtures).encode(),mtime=0);(output/'qualification-inputs.json.gz').write_bytes(body)
    return dict(passed=True,packageSha256=receipt['sha256'],fixturesSha256=digest(body))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['archive','output']:parser.add_argument('--'+name,type=lambda p:Path(p).resolve(),required=True)
    args=parser.parse_args();print(json.dumps(prepare(args.archive,args.output)))
