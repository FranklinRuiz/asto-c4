"""Regenerate assets/asto-c4-styles.json from the Asto C4 draw.io library.

Run it after changing the library so diagrams built by the skill keep matching it:

    python skills/asto-c4-diagram/scripts/sync_styles.py "Asto C4"
"""
import base64
import html
import json
import re
import sys
import urllib.parse
import zlib
from pathlib import Path

OUT = Path(__file__).parent.parent / 'assets' / 'asto-c4-styles.json'

# Skill kind -> library entry title.
ENTRIES = {
    'person': 'Person', 'external_person': 'External Person',
    'system': 'Software System', 'external_system': 'External Software System',
    'container': 'Container', 'web_browser': 'Web Browser Container', 'server_app': 'Server-side App Container',
    'folder': 'Folder Container', 'database': 'Data Container', 'bucket': 'Bucket Container',
    'message_bus': 'Message Bus Container', 'mobile_app': 'Mobile App Container',
    'component': 'Component', 'infrastructure_node': 'Infrastructure Node',
    'system_boundary': 'System scope boundary', 'container_boundary': 'Container scope boundary',
    'relationship': 'Relationship with description and technology',
    'title_context': 'System context diagram title', 'title_containers': 'Containers diagram title',
    'title_components': 'Components diagram title',
    'deployment_node': 'Deployment node boundary',
    'title_dynamic': 'Dynamic diagram title',
    'title_deployment': 'Deployment diagram title',
}


def decode(xml):
    """Library entries are either compressed (deflate + base64) or HTML-escaped XML."""
    s = xml.lstrip()
    if s.startswith('<'):
        return xml
    if s.startswith('&lt;'):
        return html.unescape(xml)
    return urllib.parse.unquote(zlib.decompress(base64.b64decode(xml), -15).decode('utf-8'))


def main(library_path):
    text = Path(library_path).read_text(encoding='utf-8')
    entries = {e['title']: e for e in json.loads(re.search(r'<mxlibrary>(.*)</mxlibrary>', text, re.S).group(1))}
    out = {}
    for kind, title in ENTRIES.items():
        if title not in entries:
            sys.exit(f'error: the library has no entry titled {title!r}')
        entry = entries[title]
        xml = decode(entry['xml'])
        label = re.search(r'<object label="([^"]*)"', xml)
        out[kind] = {
            'title': title,
            'style': re.search(r'style="([^"]*)"', xml).group(1),
            'label': html.unescape(label.group(1)) if label else '',
            'width': entry['w'],
            'height': entry['h'],
        }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'wrote {OUT} ({len(out)} styles)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: python sync_styles.py "path/to/Asto C4"')
    main(sys.argv[1])
