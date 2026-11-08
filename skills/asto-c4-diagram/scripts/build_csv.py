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
    'context': {'title': 'title_context', 'prefix': 'System Context View', 'boundary': None},
    'containers': {'title': 'title_containers', 'prefix': 'Container View', 'boundary': 'system_boundary'},
    'components': {'title': 'title_components', 'prefix': 'Component View', 'boundary': 'container_boundary'},
    'dynamic': {'title': 'title_dynamic', 'prefix': 'Dynamic View', 'boundary': None},
    'deployment': {'title': 'title_deployment', 'prefix': 'Deployment View', 'boundary': None},
}
DYNAMIC_SCOPES = ('context', 'containers', 'components')
PERSON_KINDS = {'person', 'external_person'}
COL_W, ROW_GAP, PER_ROW, CORE_PER_ROW, PAD, RIGHT_GAP = 350, 110, 4, 4, 50, 200
NODE_PAD, NODE_LABEL, NODE_GAP_X, NODE_GAP_Y, NODE_PER_ROW = 30, 60, 90, 90, 3
RESERVED_IDS = {'title', 'boundary', 'system'}
MAX_DESCRIPTION = 90
MAX_NAME = 40

# Anchors for relationships that go both ways between the same two elements (a request and its response),
# so the two arrows run side by side instead of on top of each other. Keyed by where the target is.
PAIR_ANCHORS = {
    'E': 'exitX=1;exitY=0.4;entryX=0;entryY=0.4;verticalLabelPosition=top;verticalAlign=bottom;',
    'W': 'exitX=0;exitY=0.7;entryX=1;entryY=0.7;verticalLabelPosition=bottom;verticalAlign=top;',
    'S': 'exitX=0.4;exitY=1;entryX=0.4;entryY=0;labelPosition=left;align=right;',
    'N': 'exitX=0.6;exitY=0;entryX=0.6;entryY=1;labelPosition=right;align=left;',
}


def fail(msg):
    sys.exit(f'error: {msg}')


def shape_level(spec):
    """The level whose layout a diagram uses: a dynamic diagram is drawn like its scope."""
    return spec.get('scope', 'components') if spec['level'] == 'dynamic' else spec['level']


def validate(spec):
    level = spec.get('level')
    if level not in LEVELS:
        fail(f'level must be one of {sorted(LEVELS)}')
    if level == 'dynamic' and spec.get('scope', 'components') not in DYNAMIC_SCOPES:
        fail(f'scope of a dynamic diagram must be one of {list(DYNAMIC_SCOPES)}')
    ids = set()
    for e in spec.get('elements', []):
        if not e.get('id') or not e.get('name'):
            fail(f'every element needs id and name: {e}')
        if e['id'] in ids:
            fail(f'duplicate element id: {e["id"]}')
        if e['id'] in RESERVED_IDS:
            fail(f'element id {e["id"]!r} is reserved; use another id')
        if e.get('kind') not in ELEMENT_KINDS:
            fail(f'element {e["id"]} has unknown kind {e.get("kind")!r}; use one of {sorted(ELEMENT_KINDS)}')
        ids.add(e['id'])
    for r in spec.get('relationships', []):
        for end in ('from', 'to'):
            if r.get(end) not in ids:
                fail(f'relationship {r} references unknown element {r.get(end)!r}')
    if level == 'deployment':
        validate_nodes(spec, ids)
    elif LEVELS[shape_level(spec)]['boundary'] and not any(e.get('inside') for e in spec['elements']):
        fail('containers/components diagrams need at least one element with "inside": true')


def validate_nodes(spec, element_ids):
    nodes = spec.get('nodes') or []
    if not nodes:
        fail('a deployment diagram needs "nodes"')
    node_ids = set()
    for n in nodes:
        if not n.get('id') or not n.get('name'):
            fail(f'every node needs id and name: {n}')
        if n['id'] in node_ids or n['id'] in element_ids or n['id'] in RESERVED_IDS:
            fail(f'node id {n["id"]!r} is duplicated or already used by an element')
        node_ids.add(n['id'])
    parents = {n['id']: n.get('parent') for n in nodes}
    for nid, parent in parents.items():
        if parent and parent not in node_ids:
            fail(f'node {nid} has unknown parent {parent!r}')
        seen, cur = set(), nid
        while cur:
            if cur in seen:
                fail(f'node {nid} is inside itself (parent cycle)')
            seen.add(cur)
            cur = parents.get(cur)
    for e in spec['elements']:
        if e.get('node') and e['node'] not in node_ids:
            fail(f'element {e["id"]} is in unknown node {e["node"]!r}')


def warn(spec):
    """Non-fatal checks that keep the diagram readable and complete."""
    rels = spec.get('relationships', [])
    linked = {r['from'] for r in rels} | {r['to'] for r in rels}
    for e in spec['elements']:
        if len(e.get('description', '')) > MAX_DESCRIPTION:
            print(f'warning: description of {e["id"]} has {len(e["description"])} characters; keep it under {MAX_DESCRIPTION}', file=sys.stderr)
        if len(e['name']) > MAX_NAME:
            print(f'warning: name of {e["id"]} is long ({len(e["name"])} characters); keep it under {MAX_NAME}', file=sys.stderr)
        if e['id'] not in linked:
            print(f'warning: {e["id"]} has no relationships', file=sys.stderr)
    if spec['level'] in ('dynamic', 'deployment'):
        return
    persons = {e['id'] for e in spec['elements'] if e['kind'] in PERSON_KINDS}
    for e in spec['elements']:
        text = f'{e["name"]} {e.get("description", "")}'.lower()
        sends_messages = any(w in text for w in ('notif', 'e-mail', 'email', 'correo', 'sms', 'mail'))
        if persons and sends_messages and not any(r['from'] == e['id'] and r['to'] in persons for r in rels):
            print(f'warning: {e["id"]} looks like it delivers messages but has no relationship to a person', file=sys.stderr)


# ---------------------------------------------------------------- layout: context, containers, components

def forward_rels(spec):
    """Relationships without the replies: drop B -> A when A -> B came first (a response in a dynamic diagram)."""
    seen, out = set(), []
    for r in spec.get('relationships', []):
        if (r['to'], r['from']) not in seen:
            out.append(r)
        seen.add((r['from'], r['to']))
    return out


def core_ids(spec):
    lvl = shape_level(spec)
    return {e['id'] for e in spec['elements']
            if e.get('inside') or (lvl == 'context' and e['kind'] == 'system')}


def pure_callers(spec):
    """Elements outside the core that call into it and are never called by it (e.g. a SPA on a component diagram)."""
    core = core_ids(spec)
    rels = forward_rels(spec)
    calls_in = {r['from'] for r in rels if r['to'] in core and r['from'] not in core}
    called = {r['to'] for r in rels if r['from'] in core}
    return calls_in - called


def neighbours(spec, eid):
    rels = spec.get('relationships', [])
    return {r['to'] for r in rels if r['from'] == eid} | {r['from'] for r in rels if r['to'] == eid}


def chunks(items, n):
    return [items[k:k + n] for k in range(0, len(items), n)]


def core_rows(spec, core, right_ids):
    """Rows of core elements ordered by call depth: what the outside calls first, what they call below.
    Within a row, elements that talk to the external systems on the right go last (rightmost)."""
    rels = [r for r in forward_rels(spec) if r['from'] in core and r['to'] in core]
    entered = {r['to'] for r in forward_rels(spec) if r['to'] in core and r['from'] not in core}
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
    talks_right = {i for i in order if neighbours(spec, i) & right_ids}
    rows = []
    for d in sorted(set(depth.get(i, 0) for i in order)):
        items = sorted((by_id[i] for i in order if depth.get(i, 0) == d), key=lambda e: e['id'] in talks_right)
        for row in chunks(items, CORE_PER_ROW):
            rows += split_crossed(row, rels)
    return rows, talks_right


def split_crossed(row, rels):
    """If a relationship inside a row jumps over another element, that element would sit on the line:
    move the jumped-over elements to their own row below (like the Security Component on c4model.com)."""
    idx = {e['id']: i for i, e in enumerate(row)}
    jumped = set()
    for r in rels:
        if r['from'] in idx and r['to'] in idx:
            lo, hi = sorted((idx[r['from']], idx[r['to']]))
            jumped |= set(range(lo + 1, hi))
    if not jumped:
        return [row]
    return [[e for i, e in enumerate(row) if i not in jumped], [e for i, e in enumerate(row) if i in jumped]]


def size_of(e):
    st = STYLES[e['kind']]
    return st['width'], st['height']


def place_row(pos, row, x_center, y):
    """Center a row on x_center; shorter elements are centered vertically on the tallest one."""
    row_h = max(size_of(e)[1] for e in row)
    x0 = x_center - len(row) * COL_W / 2
    for i, e in enumerate(row):
        w, h = size_of(e)
        pos[e['id']] = (x0 + i * COL_W + (COL_W - w) / 2, y + (row_h - h) / 2, w, h)
    return row_h


def center(p):
    return p[0] + p[2] / 2, p[1] + p[3] / 2


def place_under(spec, pos, items, y, lo, hi, forced=None):
    """Place items in one row, each under the placed elements it relates to (a database under the component
    that uses it), keeping at least one column between them and inside [lo, hi]."""
    wanted = []
    for e in items:
        xs = [center(pos[n])[0] for n in neighbours(spec, e['id']) if n in pos]
        x = (forced or {}).get(e['id']) or (sum(xs) / len(xs) if xs else (lo + hi) / 2)
        wanted.append((x, e))
    wanted.sort(key=lambda t: t[0])
    xs = []
    for cx, _ in wanted:
        cx = max(cx, lo + COL_W / 2, (xs[-1] + COL_W) if xs else lo)
        xs.append(cx)
    overflow = xs[-1] + COL_W / 2 - hi if xs else 0
    if overflow > 0:
        xs = [x - overflow for x in xs]
    row_h = max(size_of(e)[1] for e in items)
    for cx, (_, e) in zip(xs, wanted):
        w, h = size_of(e)
        pos[e['id']] = (cx - w / 2, y + (row_h - h) / 2, w, h)
    return row_h


def place_right(spec, pos, right, x, top_ids, core_top):
    """External elements in one column: those that talk to people sit high, the rest at the height of what
    they talk to (Core Banking next to the Backend)."""
    wanted = []
    for e in right:
        h = size_of(e)[1]
        if top_ids and neighbours(spec, e['id']) & top_ids:
            wy = core_top - h / 2
        else:
            ys = [center(pos[n])[1] for n in neighbours(spec, e['id']) if n in pos]
            wy = (sum(ys) / len(ys) - h / 2) if ys else core_top
        wanted.append((wy, e))
    wanted.sort(key=lambda t: t[0])
    ry = None
    for wy, e in wanted:
        w, h = size_of(e)
        ry = wy if ry is None else max(wy, ry)
        pos[e['id']] = (x, ry, w, h)
        ry += h + 60


def boundary_frame(spec, lvl, box):
    b = spec.get('boundary') or {}
    is_system = lvl == 'containers'
    style = LEVELS[lvl]['boundary']
    row = {'id': 'boundary', 'c4Name': b.get('name', 'Boundary'),
           'c4Type': 'SystemScopeBoundary' if is_system else 'ContainerScopeBoundary',
           'c4Application': b.get('type') or ('Software System' if is_system else 'Container')}
    return row, box, style, 'boundary', STYLES[style]['label']


def system_frame(spec, box):
    s = spec['system']
    row = {'id': 'system', 'c4Name': s.get('name', 'Software System'), 'c4Type': 'SystemScopeBoundary',
           'c4Application': s.get('type') or 'Software System'}
    return row, box, 'system_boundary', 'system_boundary', STYLES['system_boundary']['label']


def layout_views(spec):
    """Like the c4model.com examples: people (and callers) on top, the system or boundary in the middle,
    external systems in a column on the right at the height of what they talk to.
    On a component diagram with a "system", the container boundary sits inside the system boundary,
    with the system's other containers above (callers) or below (data stores) it."""
    lvl = shape_level(spec)
    core = core_ids(spec)
    callers = pure_callers(spec)
    nested = lvl == 'components' and bool(spec.get('system'))
    outside = [e for e in spec['elements'] if e['id'] not in core]
    in_sys = [e for e in outside if nested and e.get('in_system')]
    top = [e for e in outside if e not in in_sys and (e['kind'] in PERSON_KINDS or e['id'] in callers)]
    sys_top = [e for e in in_sys if e['id'] in callers]
    sys_bottom = [e for e in in_sys if e not in sys_top]
    right = [e for e in outside if e not in top and e not in in_sys]
    rows, talks_right = core_rows(spec, core, {e['id'] for e in right})

    inner = PAD if LEVELS[lvl]['boundary'] else 0
    outer = PAD if nested else 0
    top_rows, sys_top_rows = chunks(top, PER_ROW), chunks(sys_top, CORE_PER_ROW)
    widths = [len(r) * COL_W for r in rows + top_rows + sys_top_rows + chunks(sys_bottom, CORE_PER_ROW)]
    area_w = max(widths or [COL_W])
    left = PAD / 2
    core_left = left + outer + inner
    cx = core_left + area_w / 2
    pos, frames, y = {}, [], 0

    for row in top_rows:
        y += place_row(pos, row, cx, y) + ROW_GAP
    sys_top_y = y
    y += outer
    for row in sys_top_rows:
        y += place_row(pos, row, cx, y) + ROW_GAP

    core_top = y
    y += inner
    # First row centered; every later element under what calls it (the Backend under the UI), except those
    # that talk to external systems, which take the rightmost column next to them (adapters, e-mail senders).
    rightmost = {e['id']: core_left + area_w - COL_W / 2 for row in rows for e in row if e['id'] in talks_right}
    for i, row in enumerate(rows):
        if i == 0:
            y += place_row(pos, row, cx, y) + ROW_GAP
        else:
            y += place_under(spec, pos, row, y, core_left, core_left + area_w, rightmost) + ROW_GAP
    y -= ROW_GAP
    if inner:
        y += 70
        frames.append(boundary_frame(spec, lvl, (left + outer, core_top, area_w + 2 * inner, y - core_top)))
    if sys_bottom:
        y += ROW_GAP
        for row in chunks(sys_bottom, CORE_PER_ROW):
            y += place_under(spec, pos, row, y, core_left, core_left + area_w) + ROW_GAP
        y -= ROW_GAP
    if nested:
        y += 70
        frames.insert(0, system_frame(spec, (left, sys_top_y, area_w + 2 * inner + 2 * outer, y - sys_top_y)))

    place_right(spec, pos, right, left + area_w + 2 * inner + 2 * outer + RIGHT_GAP, {e['id'] for e in top}, core_top)
    return pos, frames


# ---------------------------------------------------------------- layout: deployment

def layout_deployment(spec):
    """Deployment nodes as nested boxes, each holding its container instances (elements first, then
    child nodes) in rows of up to three. Elements outside every node go in a column on the right."""
    nodes = {n['id']: n for n in spec['nodes']}
    children = {nid: [] for nid in nodes}
    roots = []
    by_id = {e['id']: e for e in spec['elements']}
    for e in spec['elements']:
        if e.get('node'):
            children[e['node']].append(('el', e['id']))
    for n in spec['nodes']:
        (children[n['parent']] if n.get('parent') else roots).append(('node', n['id']))
    sizes = {}

    def measure(item):
        kind, iid = item
        if kind == 'el':
            return size_of(by_id[iid])
        if iid in sizes:
            return sizes[iid]
        w, h = grid_size(children[iid])
        sizes[iid] = (max(w + 2 * NODE_PAD, 260), max(h + NODE_PAD + NODE_LABEL, 200))
        return sizes[iid]

    def ancestors(nid):
        out = []
        while nid:
            out.append(nid)
            nid = nodes[nid].get('parent')
        return out

    def owner(eid, items):
        """Which of these items holds element eid (the element itself, or the node it is deployed in)."""
        node_chain = ancestors(by_id[eid].get('node')) if by_id[eid].get('node') else []
        for item in items:
            if item == ('el', eid) or (item[0] == 'node' and item[1] in node_chain):
                return item
        return None

    def item_rows(items):
        """Order items by the flow between them, like the core of the other views: what is called first on
        top, what it calls below. Two consecutive single-item rows share one row (Web Server and Web Browser)."""
        rels = []
        for r in forward_rels(spec):
            a, b = owner(r['from'], items), owner(r['to'], items)
            if a and b and a != b:
                rels.append((a, b))
        called = {b for _, b in rels}
        depth = {i: 0 for i in items if i not in called} or {items[0]: 0}
        queue = list(depth)
        while queue:
            cur = queue.pop(0)
            for a, b in rels:
                if a == cur and b not in depth:
                    depth[b] = depth[cur] + 1
                    queue.append(b)
        rows = []
        for d in sorted(set(depth.get(i, 0) for i in items)):
            rows += chunks([i for i in items if depth.get(i, 0) == d], NODE_PER_ROW)
        merged = []
        for row in rows:
            if merged and len(row) == 1 and len(merged[-1]) == 1:
                merged[-1] = merged[-1] + row
            else:
                merged.append(row)
        return merged

    def grid_size(items):
        if not items:
            return 0, 0
        rows = item_rows(items)
        widths = [sum(measure(i)[0] for i in r) + NODE_GAP_X * (len(r) - 1) for r in rows]
        heights = [max(measure(i)[1] for i in r) for r in rows]
        return max(widths), sum(heights) + NODE_GAP_Y * (len(rows) - 1)

    pos, frames, depth = {}, [], {}

    def place(items, x, y, width, level):
        """Lay items out in rows inside a box of the given width starting at (x, y), rows centered."""
        if not items:
            return
        for r in item_rows(items):
            row_w = sum(measure(i)[0] for i in r) + NODE_GAP_X * (len(r) - 1)
            row_h = max(measure(i)[1] for i in r)
            cx = x + (width - row_w) / 2
            for item in r:
                w, h = measure(item)
                iy = y + (row_h - h) / 2
                kind, iid = item
                if kind == 'el':
                    pos[iid] = (cx, iy, w, h)
                else:
                    depth[iid] = level
                    frames.append(node_frame(nodes[iid], (cx, iy, w, h), level))
                    inner_w = w - 2 * NODE_PAD
                    place(children[iid], cx + NODE_PAD, iy + NODE_PAD, inner_w, level + 1)
                cx += w + NODE_GAP_X
            y += row_h + NODE_GAP_Y

    left = PAD / 2
    total_w, _ = grid_size(roots)
    place(roots, left, 0, total_w, 0)
    frames.sort(key=lambda f: f[5])                      # outer nodes first, so they sit behind inner ones
    loose = [e for e in spec['elements'] if not e.get('node')]
    place_right(spec, pos, loose, left + total_w + RIGHT_GAP, set(), 0)
    return pos, [f[:5] for f in frames]


def node_frame(node, box, level):
    tech = (node.get('technology') or '').strip()
    name = node['name'] + (f' x{node["instances"]}' if node.get('instances') not in (None, '', 1, '1') else '')
    label = STYLES['deployment_node']['label']
    row = {'id': node['id'], 'c4Name': name, 'c4Type': 'DeploymentNode', 'c4Application': 'Deployment Node',
           'c4Technology': tech}
    key = 'deployment_node' if tech else 'deployment_node_notech'
    return row, box, 'deployment_node', key, label if tech else label.replace(': %c4Technology%', ''), level


# ---------------------------------------------------------------- output

def label_for(kind, technology):
    label = STYLES[kind]['label']
    return label if technology else label.replace(': %c4Technology%', '')


def rel_label(r, number=None):
    tech = (r.get('technology') or '').strip()
    text = (r.get('description') or '').strip()
    if number is not None:
        text = f'{number}: {text}'
    return text + (f"<br><font style='font-size: 9px'>[{tech}]</font>" if tech else '')


def edge_group(r, pos, pairs):
    """'' for a normal floating arrow; a compass key for one half of a two-way pair."""
    if (r['to'], r['from']) not in pairs:
        return ''
    (sx, sy), (tx, ty) = center(pos[r['from']]), center(pos[r['to']])
    if abs(tx - sx) >= abs(ty - sy):
        return 'E' if tx > sx else 'W'
    return 'S' if ty > sy else 'N'


def frames_bbox(pos, frames):
    boxes = list(pos.values()) + [f[1] for f in frames]
    left = min(b[0] for b in boxes)
    bottom = max(b[1] + b[3] for b in boxes)
    width = max(b[0] + b[2] for b in boxes) - left
    return left, bottom, width


def build(spec):
    validate(spec)
    warn(spec)
    level = LEVELS[spec['level']]
    pos, frames = layout_deployment(spec) if spec['level'] == 'deployment' else layout_views(spec)

    rels = spec.get('relationships', [])
    pairs = {(r['from'], r['to']) for r in rels}
    numbered = spec['level'] == 'dynamic'
    outgoing = {}
    for n, r in enumerate(rels, start=1):
        g = edge_group(r, pos, pairs)
        outgoing.setdefault(r['from'], {}).setdefault(g, []).append((r, r.get('order', n) if numbered else None))
    groups = ['', *PAIR_ANCHORS]
    counts = {g: max((len(v.get(g, [])) for v in outgoing.values()), default=0) for g in groups}
    counts[''] = max(counts[''], 1)

    styles, labels, rows = {}, {}, []

    def add(row, box, style_key, label_key, label):
        x, y, w, h = box
        styles[style_key] = STYLES[style_key]['style']
        labels[label_key] = label
        row.update(stylename=style_key, labelname=label_key, x=x, y=y, w=w, h=h)
        rows.append(row)

    left, bottom, width = frames_bbox(pos, frames)
    title = spec.get('title') or 'Diagram title'
    add({'id': 'title', 'c4Name': f'{level["prefix"]}: {title}', 'c4Description': spec.get('description', '')},
        (left, bottom + 50, max(520, width * 0.6), 44), level['title'], 'title', STYLES[level['title']]['label'])

    for frame in frames:
        add(*frame)

    for e in spec['elements']:
        tech = (e.get('technology') or '').strip()
        row = {'id': e['id'], 'c4Name': e['name'], 'c4Type': e.get('type') or default_type(e['kind']),
               'c4Technology': tech, 'c4Description': e.get('description', '')}
        for g, items in outgoing.get(e['id'], {}).items():
            for i, (r, number) in enumerate(items, start=1):
                row[f'to{g}{i}'] = r['to']
                row[f'rel{g}{i}'] = rel_label(r, number)
        add(row, pos[e['id']], e['kind'], f'{e["kind"]}{"" if tech else "_notech"}', label_for(e['kind'], tech))

    rel_cols = [c for g in groups for i in range(1, counts[g] + 1) for c in (f'to{g}{i}', f'rel{g}{i}')]
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
        '# connect: ' + json.dumps({'from': f'to{g}{i}', 'to': 'id', 'fromlabel': f'rel{g}{i}',
                                    'style': edge + PAIR_ANCHORS.get(g, '')})
        for g in groups for i in range(1, counts[g] + 1))
    ignore = ','.join(['id', 'stylename', 'labelname', 'x', 'y', 'w', 'h', *rel_cols])
    return f"""## Asto C4 - {level['prefix']}: {title}
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
