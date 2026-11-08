"""Build a draw.io CSV import (Asto C4 notation) from a C4 diagram spec.

Usage: python build_csv.py spec.json output.txt

Spec format: see ../references/spec-format.md
"""
import csv
import io
import json
import sys
from pathlib import Path

STYLES = json.loads((Path(__file__).parent.parent / 'assets' / 'asto-c4-styles.json').read_text(encoding='utf-8'))

ELEMENT_KINDS = {
    'person', 'external_person', 'system', 'external_system', 'container', 'web_browser', 'server_app',
    'folder', 'database', 'bucket', 'message_bus', 'mobile_app', 'component', 'infrastructure_node',
}
LEVELS = {
    'context': {'title': 'title_context', 'prefix': 'System Context', 'boundary': None},
    'containers': {'title': 'title_containers', 'prefix': 'Containers', 'boundary': 'system_boundary'},
    'components': {'title': 'title_components', 'prefix': 'Components', 'boundary': 'container_boundary'},
}
PERSON_KINDS = {'person', 'external_person'}
COL_W, ROW_GAP, PER_ROW, CORE_PER_ROW, PAD, RIGHT_GAP = 350, 110, 4, 3, 50, 220


def fail(msg):
    sys.exit(f'error: {msg}')


def validate(spec):
    level = spec.get('level')
    if level not in LEVELS:
        fail(f'level must be one of {sorted(LEVELS)}')
    ids = set()
    for e in spec.get('elements', []):
        if not e.get('id') or not e.get('name'):
            fail(f'every element needs id and name: {e}')
        if e['id'] in ids:
            fail(f'duplicate element id: {e["id"]}')
        if e.get('kind') not in ELEMENT_KINDS:
            fail(f'element {e["id"]} has unknown kind {e.get("kind")!r}; use one of {sorted(ELEMENT_KINDS)}')
        ids.add(e['id'])
    for r in spec.get('relationships', []):
        for end in ('from', 'to'):
            if r.get(end) not in ids:
                fail(f'relationship {r} references unknown element {r.get(end)!r}')
    if LEVELS[level]['boundary'] and not any(e.get('inside') for e in spec['elements']):
        fail('containers/components diagrams need at least one element with "inside": true')


def core_ids(spec):
    return {e['id'] for e in spec['elements']
            if e.get('inside') or (spec['level'] == 'context' and e['kind'] == 'system')}


def pure_callers(spec):
    """Elements outside the core that call into it and are never called by it (e.g. a SPA on a component diagram)."""
    core = core_ids(spec)
    rels = spec.get('relationships', [])
    calls_in = {r['from'] for r in rels if r['to'] in core and r['from'] not in core}
    called = {r['to'] for r in rels if r['from'] in core}
    return calls_in - called


def core_rows(spec, core):
    """Rows of core elements ordered by call depth: what the outside calls first, what they call below."""
    rels = [r for r in spec.get('relationships', []) if r['from'] in core and r['to'] in core]
    entered = {r['to'] for r in spec.get('relationships', []) if r['to'] in core and r['from'] not in core}
    called = {r['to'] for r in rels}
    order = [e['id'] for e in spec['elements'] if e['id'] in core]
    roots = [i for i in order if i in entered or i not in called] or order[:1]
    depth = {i: 0 for i in roots}
    queue = list(roots)
    while queue:
        cur = queue.pop(0)
        for r in rels:
            if r['from'] == cur and r['to'] not in depth:
                depth[r['to']] = depth[cur] + 1
                queue.append(r['to'])
    by_id = {e['id']: e for e in spec['elements']}
    rows = []
    for d in sorted(set(depth.get(i, 0) for i in order)):
        items = [by_id[i] for i in order if depth.get(i, 0) == d]
        rows += [items[k:k + CORE_PER_ROW] for k in range(0, len(items), CORE_PER_ROW)]
    return rows


def place_row(pos, row, x_center, y):
    """Center a row on x_center; shorter elements are centered vertically on the tallest one."""
    row_h = max(STYLES[e['kind']]['height'] for e in row)
    x0 = x_center - len(row) * COL_W / 2
    for i, e in enumerate(row):
        st = STYLES[e['kind']]
        pos[e['id']] = (x0 + i * COL_W + (COL_W - st['width']) / 2, y + (row_h - st['height']) / 2, st['width'], st['height'])
    return row_h


def layout(spec):
    """Like the c4model.com examples: people on top, the system (or the boundary and its contents) in the
    middle, external systems and other outside elements in a column on the right, title bottom-left."""
    core = core_ids(spec)
    callers = pure_callers(spec)
    outside = [e for e in spec['elements'] if e['id'] not in core]
    top = [e for e in outside if e['kind'] in PERSON_KINDS or e['id'] in callers]
    right = [e for e in outside if e not in top]
    rows = core_rows(spec, core)
    has_boundary = bool(LEVELS[spec['level']]['boundary'])
    inner = PAD if has_boundary else 0

    top_rows = [top[k:k + PER_ROW] for k in range(0, len(top), PER_ROW)]
    area_w = max([len(r) * COL_W for r in rows + top_rows] or [COL_W])
    left = PAD / 2
    cx = left + inner + area_w / 2
    pos, y = {}, 0

    for row in top_rows:
        y += place_row(pos, row, cx, y) + ROW_GAP
    core_top = y
    y += inner
    rels = spec.get('relationships', [])
    for row in rows:
        row_cx = cx
        if len(row) == 1:
            # A lone element sits under the core elements that call it, like the Backend under the UI.
            callers_x = [pos[r['from']][0] + pos[r['from']][2] / 2 for r in rels
                         if r['to'] == row[0]['id'] and r['from'] in core and r['from'] in pos]
            if callers_x:
                half = COL_W / 2
                row_cx = min(max(sum(callers_x) / len(callers_x), left + inner + half), left + inner + area_w - half)
        y += place_row(pos, row, row_cx, y) + ROW_GAP
    y -= ROW_GAP
    boundary = None
    if has_boundary:
        y += 70
        boundary = (left, core_top, area_w + 2 * inner, y - core_top)
    core_right = left + area_w + 2 * inner

    # External elements that talk to the people go first and a bit higher, so their lines pass above the core.
    top_ids = {e['id'] for e in top}
    linked = {r['from'] for r in rels if r['to'] in top_ids} | {r['to'] for r in rels if r['from'] in top_ids}
    right.sort(key=lambda e: e['id'] not in linked)
    ry = core_top - (STYLES[right[0]['kind']]['height'] / 2 if right and right[0]['id'] in linked and top else 0)
    for e in right:
        st = STYLES[e['kind']]
        pos[e['id']] = (core_right + RIGHT_GAP, ry, st['width'], st['height'])
        ry += st['height'] + ROW_GAP

    bottom = max(p[1] + p[3] for p in pos.values())
    if boundary:
        bottom = max(bottom, boundary[1] + boundary[3])
    width = max(p[0] + p[2] for p in pos.values()) - left
    title = (left, bottom + 50, max(520, width * 0.6), 44)
    return pos, boundary, title


def label_for(kind, technology):
    label = STYLES[kind]['label']
    return label if technology else label.replace(': %c4Technology%', '')


def rel_label(r):
    tech = (r.get('technology') or '').strip()
    text = (r.get('description') or '').strip()
    return text + (f"<br><font style='font-size: 9px'>[{tech}]</font>" if tech else '')


def build(spec):
    validate(spec)
    level = LEVELS[spec['level']]
    pos, boundary, title_box = layout(spec)
    outgoing = {}
    for r in spec.get('relationships', []):
        outgoing.setdefault(r['from'], []).append(r)
    n_rel = max((len(v) for v in outgoing.values()), default=1)

    styles, labels, rows = {}, {}, []

    def add(row, style_key, label_key, label):
        styles[style_key] = STYLES[style_key]['style']
        labels[label_key] = label
        row.update(stylename=style_key, labelname=label_key)
        rows.append(row)

    title = spec.get('title') or 'Diagram title'
    add({'id': 'title', 'c4Name': f'[{level["prefix"]}] {title}', 'c4Description': spec.get('description', ''),
         'x': title_box[0], 'y': title_box[1], 'w': title_box[2], 'h': title_box[3]}, level['title'], 'title', STYLES[level['title']]['label'])

    if boundary:
        b = spec.get('boundary') or {}
        bx, by, bw, bh = boundary
        add({'id': 'boundary', 'c4Name': b.get('name', 'Boundary'), 'c4Type': 'SystemScopeBoundary' if spec['level'] == 'containers' else 'ContainerScopeBoundary',
             'c4Application': b.get('type') or ('Software System' if spec['level'] == 'containers' else 'Container'),
             'x': bx, 'y': by, 'w': bw, 'h': bh}, level['boundary'], 'boundary', STYLES[level['boundary']]['label'])

    for e in spec['elements']:
        x, y, w, h = pos[e['id']]
        tech = (e.get('technology') or '').strip()
        row = {'id': e['id'], 'c4Name': e['name'], 'c4Type': e.get('type') or default_type(e['kind']),
               'c4Technology': tech, 'c4Description': e.get('description', ''), 'x': x, 'y': y, 'w': w, 'h': h}
        for i, r in enumerate(outgoing.get(e['id'], []), start=1):
            row[f'to{i}'] = r['to']
            row[f'rel{i}'] = rel_label(r)
        key = f'{e["kind"]}{"" if tech else "_notech"}'
        add(row, e['kind'], key, label_for(e['kind'], tech))

    rel_cols = [c for i in range(1, n_rel + 1) for c in (f'to{i}', f'rel{i}')]
    cols = ['id', 'stylename', 'labelname', 'c4Name', 'c4Type', 'c4Technology', 'c4Description', 'c4Application',
            'x', 'y', 'w', 'h', *rel_cols]
    for row in rows:
        for k in ('x', 'y', 'w', 'h'):
            row[k] = round(row[k])
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=cols, lineterminator='\n', restval='')
    writer.writeheader()
    writer.writerows(rows)

    edge = STYLES['relationship']['style']
    connects = '\n'.join(
        '# connect: ' + json.dumps({'from': f'to{i}', 'to': 'id', 'fromlabel': f'rel{i}', 'style': edge})
        for i in range(1, n_rel + 1))
    ignore = ','.join(['id', 'stylename', 'labelname', 'x', 'y', 'w', 'h', *rel_cols])
    return f"""## Asto C4 - {level['prefix']} diagram: {title}
## draw.io: Arrange > Insert > Advanced > CSV..., replace the sample, paste everything and click Import.
#
# label: %c4Name%
# stylename: stylename
# styles: {json.dumps(styles)}
# labelname: labelname
# labels: {json.dumps(labels)}
# identity: id
# namespace: csvimport-
{connects}
# left: x
# top: y
# width: @w
# height: @h
# ignore: {ignore}
# nodespacing: 40
# levelspacing: 100
# edgespacing: 40
# layout: none
## ---- CSV below this line. First line are column names. ----
{buf.getvalue()}"""


def default_type(kind):
    if kind in PERSON_KINDS:
        return 'Person'
    if kind in ('system', 'external_system'):
        return 'Software System'
    if kind == 'component':
        return 'Component'
    if kind == 'infrastructure_node':
        return 'Infrastructure Node'
    return 'Container'


if __name__ == '__main__':
    if len(sys.argv) != 3:
        fail('usage: python build_csv.py spec.json output.txt')
    spec = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    Path(sys.argv[2]).write_text(build(spec), encoding='utf-8', newline='\n')
    print(f'wrote {sys.argv[2]}')
