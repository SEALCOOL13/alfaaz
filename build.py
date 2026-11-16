#!/usr/bin/env python3
"""Builds the Chromium and Firefox packages from src/ into dist/."""
import json, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).parent
SRC, DIST = ROOT / 'src', ROOT / 'dist'


def write(target: str, manifest: dict) -> None:
    out = DIST / target
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(SRC, out, ignore=shutil.ignore_patterns('manifest.json', '.*'))
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    ext = 'xpi' if target == 'firefox' else 'zip'
    pkg = DIST / f"alfaaz-{manifest['version']}-{target}.{ext}"
    with zipfile.ZipFile(pkg, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob('*')):
            if f.is_file():
                z.write(f, f.relative_to(out).as_posix())
    print('built', pkg.name)


def main() -> None:
    base = json.loads((SRC / 'manifest.json').read_text(encoding='utf-8'))
    DIST.mkdir(exist_ok=True)

    write('chromium', base)

    ff = json.loads(json.dumps(base))
    ff['background'] = {'scripts': ['lib/common.js', 'lib/fontstore.js', 'background.js']}
    for cs in ff['content_scripts']:
        cs.pop('match_origin_as_fallback', None)
    ff['browser_specific_settings'] = {
        'gecko': {
            'id': 'alfaaz@urdu-text.local',
            'strict_min_version': '128.0',
            'data_collection_permissions': {'required': ['none']},
        }
    }
    write('firefox', ff)


if __name__ == '__main__':
    main()
