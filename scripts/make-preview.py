"""Rewrite dist-preview/ so every internal link is relative (for the claude.ai preview host).
Run after: PREVIEW=1 npx astro build --outDir dist-preview"""
import os, re

ROOT = 'dist-preview'

def rel(path, prefix):
    # path starts with "/" ; split off ?query and #hash
    m = re.match(r'^(/[^?#]*)(\?[^#]*)?(#.*)?$', path)
    p, q, h = m.group(1), m.group(2) or '', m.group(3) or ''
    if p.endswith('/'):
        p += 'index.html'
    return prefix + p.lstrip('/') + q + h

for dirpath, _, files in os.walk(ROOT):
    for f in files:
        if not f.endswith('.html'):
            continue
        full = os.path.join(dirpath, f)
        depth = os.path.relpath(full, ROOT).count(os.sep)
        prefix = '../' * depth
        s = open(full, encoding='utf-8').read()
        s = re.sub(r'(href|src)="(/(?!/)[^"]*)"', lambda m: f'{m.group(1)}="{rel(m.group(2), prefix)}"', s)
        s = re.sub(r'srcset="([^"]*)"', lambda m: 'srcset="' + re.sub(r'(^|,\s*)(/[^\s,]+)', lambda n: n.group(1) + rel(n.group(2), prefix), m.group(1)) + '"', s)
        s = re.sub(r'url\((/_astro/[^)]+)\)', lambda m: f'url({rel(m.group(1), prefix)})', s)
        # canonical/hreflang stay absolute (they point at cleansense.co) — untouched above since they are https://
        open(full, 'w', encoding='utf-8').write(s)
print('rewritten')
