#!/usr/bin/env node
// Build a draw.io CSV import (Asto C4 notation) from a C4 diagram spec.
//
// Usage: node build_csv.mjs spec.json output.txt
//
// Spec format: see ../references/spec-format.md. Needs only Node.js 18 or later (no packages).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = JSON.parse(readFileSync(join(HERE, '..', 'assets', 'asto-c4-styles.json'), 'utf8'));

const ELEMENT_KINDS = new Set([
  'person', 'external_person', 'system', 'external_system', 'container', 'web_browser', 'server_app',
  'folder', 'database', 'bucket', 'message_bus', 'mobile_app', 'component', 'infrastructure_node',
]);
const LEVELS = {
  context: { title: 'title_context', prefix: 'System Context View', boundary: null },
  containers: { title: 'title_containers', prefix: 'Container View', boundary: 'system_boundary' },
  components: { title: 'title_components', prefix: 'Component View', boundary: 'container_boundary' },
  dynamic: { title: 'title_dynamic', prefix: 'Dynamic View', boundary: null },
  deployment: { title: 'title_deployment', prefix: 'Deployment View', boundary: null },
};
const DYNAMIC_SCOPES = ['context', 'containers', 'components'];
const PERSON_KINDS = new Set(['person', 'external_person']);
const [COL_W, ROW_GAP, PER_ROW, CORE_PER_ROW, PAD, RIGHT_GAP] = [350, 110, 4, 4, 50, 200];
const [NODE_PAD, NODE_LABEL, NODE_GAP_X, NODE_GAP_Y, NODE_PER_ROW] = [30, 60, 90, 90, 3];
const RESERVED_IDS = new Set(['title', 'boundary', 'system']);
const MAX_DESCRIPTION = 90;
const MAX_NAME = 40;
const MAX_EXTERNALS = 6;
const MAX_ELEMENTS = 15;
const MAX_INSIDE = 10;
const RIGHT_V_GAP = 50;

// Anchors for relationships that go both ways between the same two elements (a request and its response),
// so the two arrows run side by side instead of on top of each other. Keyed by where the target is.
const PAIR_ANCHORS = {
  E: 'exitX=1;exitY=0.4;entryX=0;entryY=0.4;verticalLabelPosition=top;verticalAlign=bottom;',
  W: 'exitX=0;exitY=0.7;entryX=1;entryY=0.7;verticalLabelPosition=bottom;verticalAlign=top;',
  S: 'exitX=0.4;exitY=1;entryX=0.4;entryY=0;labelPosition=left;align=right;',
  N: 'exitX=0.6;exitY=0;entryX=0.6;entryY=1;labelPosition=right;align=left;',
};

// Where an arrow's label goes when the middle of the arrow is already taken by another label or element.
const LABEL_ANCHORS = {
  U: 'verticalLabelPosition=top;verticalAlign=bottom;',
  D: 'verticalLabelPosition=bottom;verticalAlign=top;',
  L: 'labelPosition=left;align=right;',
  R: 'labelPosition=right;align=left;',
  LU: 'labelPosition=left;align=right;verticalLabelPosition=top;verticalAlign=bottom;',
  RD: 'labelPosition=right;align=left;verticalLabelPosition=bottom;verticalAlign=top;',
};

// ---------------------------------------------------------------- helpers

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

const warning = (msg) => process.stderr.write(`warning: ${msg}\n`);
const chars = (s) => Array.from(s ?? '').length;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => sum(xs) / xs.length;
const rels = (spec) => spec.relationships || [];
const intersects = (set, other) => [...set].some((x) => other.has(x));
const key2 = (a, b) => `${a}\u0000${b}`;

function chunks(items, n) {
  const out = [];
  for (let k = 0; k < items.length; k += n) out.push(items.slice(k, k + n));
  return out;
}

/** Round half to even, like Python's round(), so both versions of this script give the same output. */
function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** JSON like Python's json.dumps for a flat object of strings (", " and ": " separators, ASCII only). */
function pyDumps(obj) {
  const q = (s) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `{${Object.entries(obj).map(([k, v]) => `${q(k)}: ${q(v)}`).join(', ')}}`;
}

function csvField(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------------------------------------------------------------- checks

/** The level whose layout a diagram uses: a dynamic diagram is drawn like its scope. */
function shapeLevel(spec) {
  return spec.level === 'dynamic' ? (spec.scope ?? 'components') : spec.level;
}

function validate(spec) {
  const level = spec.level;
  if (!(level in LEVELS)) fail(`level must be one of ${JSON.stringify(Object.keys(LEVELS).sort())}`);
  if (level === 'dynamic' && !DYNAMIC_SCOPES.includes(spec.scope ?? 'components')) {
    fail(`scope of a dynamic diagram must be one of ${JSON.stringify(DYNAMIC_SCOPES)}`);
  }
  if (!Array.isArray(spec.elements)) fail('the spec needs an "elements" list');
  const ids = new Set();
  for (const e of spec.elements) {
    if (!e.id || !e.name) fail(`every element needs id and name: ${JSON.stringify(e)}`);
    if (ids.has(e.id)) fail(`duplicate element id: ${e.id}`);
    if (RESERVED_IDS.has(e.id)) fail(`element id '${e.id}' is reserved; use another id`);
    if (!ELEMENT_KINDS.has(e.kind)) {
      fail(`element ${e.id} has unknown kind '${e.kind}'; use one of ${JSON.stringify([...ELEMENT_KINDS].sort())}`);
    }
    ids.add(e.id);
  }
  for (const r of rels(spec)) {
    for (const end of ['from', 'to']) {
      if (!ids.has(r[end])) fail(`relationship ${JSON.stringify(r)} references unknown element '${r[end]}'`);
    }
  }
  if (level === 'deployment') validateNodes(spec, ids);
  else if (LEVELS[shapeLevel(spec)].boundary && !spec.elements.some((e) => e.inside)) {
    fail('containers/components diagrams need at least one element with "inside": true');
  }
}

function validateNodes(spec, elementIds) {
  const nodes = spec.nodes || [];
  if (!nodes.length) fail('a deployment diagram needs "nodes"');
  const nodeIds = new Set();
  for (const n of nodes) {
    if (!n.id || !n.name) fail(`every node needs id and name: ${JSON.stringify(n)}`);
    if (nodeIds.has(n.id) || elementIds.has(n.id) || RESERVED_IDS.has(n.id)) {
      fail(`node id '${n.id}' is duplicated or already used by an element`);
    }
    nodeIds.add(n.id);
  }
  const parents = Object.fromEntries(nodes.map((n) => [n.id, n.parent]));
  for (const [nid, parent] of Object.entries(parents)) {
    if (parent && !nodeIds.has(parent)) fail(`node ${nid} has unknown parent '${parent}'`);
    const seen = new Set();
    let cur = nid;
    while (cur) {
      if (seen.has(cur)) fail(`node ${nid} is inside itself (parent cycle)`);
      seen.add(cur);
      cur = parents[cur];
    }
  }
  for (const e of spec.elements) {
    if (e.node && !nodeIds.has(e.node)) fail(`element ${e.id} is in unknown node '${e.node}'`);
  }
}

/** Non-fatal checks that keep the diagram readable and complete. */
function warn(spec) {
  const rs = rels(spec);
  const linked = new Set(rs.flatMap((r) => [r.from, r.to]));
  for (const e of spec.elements) {
    const d = chars(e.description);
    if (d > MAX_DESCRIPTION) warning(`description of ${e.id} has ${d} characters; keep it under ${MAX_DESCRIPTION}`);
    const n = chars(e.name);
    if (n > MAX_NAME) warning(`name of ${e.id} is long (${n} characters); keep it under ${MAX_NAME}`);
    if (!linked.has(e.id)) warning(`${e.id} has no relationships`);
  }
  // A good C4 diagram shows only what is needed to understand the solution at its level.
  if (spec.elements.length > MAX_ELEMENTS) {
    warning(`${spec.elements.length} elements; a C4 diagram reads best with about ${MAX_ELEMENTS} or fewer. `
      + 'Show only what is needed: group similar elements or split the diagram');
  }
  const inside = spec.elements.filter((e) => e.inside).length;
  if (inside > MAX_INSIDE) {
    warning(`${inside} elements inside the boundary; about ${MAX_INSIDE} or fewer keeps it readable. `
      + 'Group similar ones or split into more diagrams');
  }
  if (spec.level === 'dynamic' || spec.level === 'deployment') return;
  const externals = spec.elements.filter((e) => e.kind === 'external_system');
  if (externals.length > MAX_EXTERNALS) {
    warning(`${externals.length} external systems; the diagram gets crowded above ${MAX_EXTERNALS}. `
      + 'Leave out cross-cutting services (audit, monitoring, logging) unless they matter to this view, '
      + 'or group related ones');
  }
  const persons = new Set(spec.elements.filter((e) => PERSON_KINDS.has(e.kind)).map((e) => e.id));
  for (const e of spec.elements) {
    const text = `${e.name} ${e.description ?? ''}`.toLowerCase();
    const sendsMessages = ['notif', 'e-mail', 'email', 'correo', 'sms', 'mail'].some((w) => text.includes(w));
    if (persons.size && sendsMessages && !rs.some((r) => r.from === e.id && persons.has(r.to))) {
      warning(`${e.id} looks like it delivers messages but has no relationship to a person`);
    }
  }
}

// ---------------------------------------------------------------- layout: context, containers, components

/** Relationships without the replies: drop B -> A when A -> B came first (a response in a dynamic diagram). */
function forwardRels(spec) {
  const seen = new Set();
  const out = [];
  for (const r of rels(spec)) {
    if (!seen.has(key2(r.to, r.from))) out.push(r);
    seen.add(key2(r.from, r.to));
  }
  return out;
}

function coreIds(spec) {
  const lvl = shapeLevel(spec);
  return new Set(spec.elements.filter((e) => e.inside || (lvl === 'context' && e.kind === 'system')).map((e) => e.id));
}

/** Elements outside the core that call into it and are never called by it (e.g. a SPA on a component diagram). */
function pureCallers(spec) {
  const core = coreIds(spec);
  const rs = forwardRels(spec);
  const called = new Set(rs.filter((r) => core.has(r.from)).map((r) => r.to));
  return new Set(rs.filter((r) => core.has(r.to) && !core.has(r.from) && !called.has(r.from)).map((r) => r.from));
}

function neighbours(spec, eid) {
  const out = new Set();
  for (const r of rels(spec)) {
    if (r.from === eid) out.add(r.to);
  }
  for (const r of rels(spec)) {
    if (r.to === eid) out.add(r.from);
  }
  return out;
}

/** Rows of core elements ordered by call depth: what the outside calls first, what they call below.
 *  Within a row, elements that talk to the external systems on the right go last (rightmost). */
function coreRows(spec, core, rightIds) {
  const rs = forwardRels(spec).filter((r) => core.has(r.from) && core.has(r.to));
  const entered = new Set(forwardRels(spec).filter((r) => core.has(r.to) && !core.has(r.from)).map((r) => r.to));
  const called = new Set(rs.map((r) => r.to));
  const order = spec.elements.filter((e) => core.has(e.id)).map((e) => e.id);
  let roots = order.filter((i) => entered.has(i) || !called.has(i));
  if (!roots.length) roots = order.slice(0, 1);
  const depth = new Map(roots.map((i) => [i, 0]));
  const queue = [...roots];
  while (queue.length) {
    const cur = queue.shift();
    for (const r of rs) {
      if (r.from === cur && !depth.has(r.to)) {
        depth.set(r.to, depth.get(cur) + 1);
        queue.push(r.to);
      }
    }
  }
  const byId = new Map(spec.elements.map((e) => [e.id, e]));
  const talksRight = new Set(order.filter((i) => intersects(neighbours(spec, i), rightIds)));
  const rows = [];
  const depths = [...new Set(order.map((i) => depth.get(i) ?? 0))].sort((a, b) => a - b);
  for (const d of depths) {
    // the more an element talks to external systems, the further right it goes
    const outward = (e) => [...neighbours(spec, e.id)].filter((n) => rightIds.has(n)).length;
    const items = order.filter((i) => (depth.get(i) ?? 0) === d).map((i) => byId.get(i))
      .sort((a, b) => outward(a) - outward(b));
    for (const row of chunks(items, CORE_PER_ROW)) rows.push(...splitCrossed(row, rs));
  }
  return [rows, talksRight];
}

/** If a relationship inside a row jumps over another element, that element would sit on the line:
 *  move the jumped-over elements to their own row below (like the Security Component on c4model.com). */
function splitCrossed(row, rs) {
  const idx = new Map(row.map((e, i) => [e.id, i]));
  const jumped = new Set();
  for (const r of rs) {
    if (idx.has(r.from) && idx.has(r.to)) {
      const [lo, hi] = [idx.get(r.from), idx.get(r.to)].sort((a, b) => a - b);
      for (let k = lo + 1; k < hi; k++) jumped.add(k);
    }
  }
  if (!jumped.size) return [row];
  return [row.filter((_, i) => !jumped.has(i)), row.filter((_, i) => jumped.has(i))];
}

function sizeOf(e) {
  const st = STYLES[e.kind];
  return [st.width, st.height];
}

/** Center a row on xCenter; shorter elements are centered vertically on the tallest one. */
function placeRow(pos, row, xCenter, y) {
  const rowH = Math.max(...row.map((e) => sizeOf(e)[1]));
  const x0 = xCenter - (row.length * COL_W) / 2;
  row.forEach((e, i) => {
    const [w, h] = sizeOf(e);
    pos.set(e.id, [x0 + i * COL_W + (COL_W - w) / 2, y + (rowH - h) / 2, w, h]);
  });
  return rowH;
}

function center(p) {
  return [p[0] + p[2] / 2, p[1] + p[3] / 2];
}

/** Place items in one row, each under the placed elements it relates to (a database under the component
 *  that uses it), keeping at least one column between them and inside [lo, hi]. */
function placeUnder(spec, pos, items, y, lo, hi, forced = {}) {
  const wanted = items.map((e) => {
    const xs = [...neighbours(spec, e.id)].filter((n) => pos.has(n)).map((n) => center(pos.get(n))[0]);
    return [forced[e.id] || (xs.length ? mean(xs) : (lo + hi) / 2), e];
  });
  wanted.sort((a, b) => a[0] - b[0]);
  let xs = [];
  for (const [wx] of wanted) xs.push(Math.max(wx, lo + COL_W / 2, xs.length ? xs[xs.length - 1] + COL_W : lo));
  const overflow = xs.length ? xs[xs.length - 1] + COL_W / 2 - hi : 0;
  if (overflow > 0) xs = xs.map((x) => x - overflow);
  const rowH = Math.max(...items.map((e) => sizeOf(e)[1]));
  wanted.forEach(([, e], i) => {
    const [w, h] = sizeOf(e);
    pos.set(e.id, [xs[i] - w / 2, y + (rowH - h) / 2, w, h]);
  });
  return rowH;
}

/** Stack [wantedY, tie, element] in a column without overlaps. Elements that want the same height form a
 *  group centred on that height (instead of hanging below it), so the column stays close to what it talks to. */
function stackColumn(pos, wanted, x) {
  wanted.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const clusters = [];
  for (const [wy, , e] of wanted) {
    clusters.push({ items: [e], wants: [wy], top: wy, height: sizeOf(e)[1] });
    for (;;) {
      const last = clusters[clusters.length - 1];
      const prev = clusters[clusters.length - 2];
      if (!prev || prev.top + prev.height + RIGHT_V_GAP <= last.top) break;
      // merge and centre the group: each member's wanted top minus its offset inside the group
      const items = [...prev.items, ...last.items];
      const wants = [...prev.wants, ...last.wants];
      let offset = 0;
      const tops = items.map((it, i) => {
        const t = wants[i] - offset;
        offset += sizeOf(it)[1] + RIGHT_V_GAP;
        return t;
      });
      clusters.splice(-2, 2, { items, wants, top: mean(tops), height: offset - RIGHT_V_GAP });
    }
  }
  for (const c of clusters) {
    let ry = c.top;
    for (const e of c.items) {
      const [w, h] = sizeOf(e);
      pos.set(e.id, [x, ry, w, h]);
      ry += h + RIGHT_V_GAP;
    }
  }
}

/** External elements on the right. The first column holds those used by the system: the ones that talk
 *  to people sit high, the rest at the height of what they talk to (Core Banking next to the Backend).
 *  Externals reached only through other externals (a clearing house's settlement bank) go in further
 *  columns, next to their partner, so their lines do not cross the first column. */
function placeRight(spec, pos, right, x, topIds, coreTop) {
  const placedBefore = new Set(pos.keys());
  const columns = [];
  let level = right.filter((e) => intersects(neighbours(spec, e.id), placedBefore));
  if (!level.length) level = right.slice(0, 1);
  let rest = right.filter((e) => !level.includes(e));
  while (level.length) {
    columns.push(level);
    const done = new Set(columns.flat().map((e) => e.id));
    level = rest.filter((e) => intersects(neighbours(spec, e.id), done));
    rest = rest.filter((e) => !level.includes(e));
    if (!level.length && rest.length) [level, rest] = [rest.slice(0, 1), rest.slice(1)];
  }
  columns.forEach((col, c) => {
    // leave room for the longest label of the arrows that reach this column
    const ids = new Set(col.map((e) => e.id));
    const widest = Math.max(0, ...rels(spec).filter((r) => ids.has(r.from) !== ids.has(r.to)).map(labelWidth));
    x += Math.max(0, widest + 60 - RIGHT_GAP);
    let wanted = col.map((e) => {
      const h = sizeOf(e)[1];
      const nb = neighbours(spec, e.id);
      const placedOthers = new Set([...placedBefore].filter((n) => !topIds.has(n)));
      let wy;
      if (topIds.size && intersects(nb, topIds) && intersects(nb, placedOthers)) {
        wy = coreTop - h / 2;
      } else {
        const ys = [...nb].filter((n) => pos.has(n)).map((n) => center(pos.get(n))[1]);
        wy = ys.length ? mean(ys) - h / 2 : coreTop;
      }
      // same height: the one whose partner is further right goes first, so its line stays straight
      const xs = [...nb].filter((n) => pos.has(n)).map((n) => center(pos.get(n))[0]);
      return [wy, -Math.max(...(xs.length ? xs : [0])), e];
    });
    if (c > 0) {
      // centre each group of siblings on its partner
      const groups = new Map();
      for (const t of wanted) {
        const placed = [...neighbours(spec, t[2].id)].filter((n) => pos.has(n)).sort();
        const key = placed.length ? placed[0] : '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
      }
      wanted = [];
      for (const [key, items] of groups) {
        const span = sum(items.map((t) => sizeOf(t[2])[1])) + RIGHT_V_GAP * (items.length - 1);
        const mid = pos.has(key) ? center(pos.get(key))[1] : coreTop;
        let y0 = mid - span / 2;
        for (const t of items) {
          wanted.push([y0, t[1], t[2]]);
          y0 += sizeOf(t[2])[1] + RIGHT_V_GAP;
        }
      }
    }
    stackColumn(pos, wanted, x);
    x += Math.max(...col.map((e) => sizeOf(e)[0])) + RIGHT_GAP;
  });
}

function boundaryFrame(spec, lvl, box) {
  const b = spec.boundary || {};
  const isSystem = lvl === 'containers';
  const style = LEVELS[lvl].boundary;
  const row = {
    id: 'boundary', c4Name: b.name ?? 'Boundary',
    c4Type: isSystem ? 'SystemScopeBoundary' : 'ContainerScopeBoundary',
    c4Application: b.type || (isSystem ? 'Software System' : 'Container'),
  };
  return [row, box, style, 'boundary', STYLES[style].label];
}

function systemFrame(spec, box) {
  const s = spec.system;
  const row = {
    id: 'system', c4Name: s.name ?? 'Software System', c4Type: 'SystemScopeBoundary',
    c4Application: s.type || 'Software System',
  };
  return [row, box, 'system_boundary', 'system_boundary', STYLES.system_boundary.label];
}

/** Like the c4model.com examples: people (and callers) on top, the system or boundary in the middle,
 *  external systems in a column on the right at the height of what they talk to.
 *  On a component diagram with a "system", the container boundary sits inside the system boundary,
 *  with the system's other containers above (callers) or below (data stores) it. */
function layoutViews(spec) {
  const lvl = shapeLevel(spec);
  const core = coreIds(spec);
  const callers = pureCallers(spec);
  const nested = lvl === 'components' && Boolean(spec.system);
  const outside = spec.elements.filter((e) => !core.has(e.id));
  const inSys = outside.filter((e) => nested && e.in_system);
  const top = outside.filter((e) => !inSys.includes(e) && (PERSON_KINDS.has(e.kind) || callers.has(e.id)));
  const sysTop = inSys.filter((e) => callers.has(e.id));
  const sysBottom = inSys.filter((e) => !sysTop.includes(e));
  const right = outside.filter((e) => !top.includes(e) && !inSys.includes(e));
  const rightIds = new Set(right.map((e) => e.id));
  // people that hear from external systems (notifications) go right, next to them
  top.sort((a, b) => Number(intersects(neighbours(spec, a.id), rightIds)) - Number(intersects(neighbours(spec, b.id), rightIds)));
  const [rows, talksRight] = coreRows(spec, core, rightIds);

  const inner = LEVELS[lvl].boundary ? PAD : 0;
  const outer = nested ? PAD : 0;
  const topRows = chunks(top, PER_ROW);
  const sysTopRows = chunks(sysTop, CORE_PER_ROW);
  const widths = [...rows, ...topRows, ...sysTopRows, ...chunks(sysBottom, CORE_PER_ROW)].map((r) => r.length * COL_W);
  const areaW = Math.max(...(widths.length ? widths : [COL_W]));
  const left = PAD / 2;
  const coreLeft = left + outer + inner;
  const cx = coreLeft + areaW / 2;
  const pos = new Map();
  const frames = [];
  let y = 0;

  const callerRows = [];
  for (const row of topRows) {
    callerRows.push([row, y]);
    y += placeRow(pos, row, cx, y) + ROW_GAP;
  }
  const sysTopY = y;
  y += outer;
  for (const row of sysTopRows) {
    callerRows.push([row, y]);
    y += placeRow(pos, row, cx, y) + ROW_GAP;
  }

  const coreTop = y;
  y += inner;
  // First row centered; every later element under what calls it (the Backend under the UI), except those
  // that talk to external systems, which take the rightmost column next to them (adapters, e-mail senders).
  const rightmost = {};
  for (const row of rows) for (const e of row) if (talksRight.has(e.id)) rightmost[e.id] = coreLeft + areaW - COL_W / 2;
  rows.forEach((row, i) => {
    if (i === 0 && !row.some((e) => e.id in rightmost)) {
      // in the order of the people or callers above them, so their arrows do not cross
      const callerX = (e) => {
        const xs = [...neighbours(spec, e.id)].filter((n) => pos.has(n)).map((n) => center(pos.get(n))[0]);
        return xs.length ? mean(xs) : cx;
      };
      row = [...row].sort((a, b) => callerX(a) - callerX(b));
      y += placeRow(pos, row, cx, y) + ROW_GAP;
    }
    else y += placeUnder(spec, pos, row, y, coreLeft, coreLeft + areaW, rightmost) + ROW_GAP;
  });
  y -= ROW_GAP;
  // callers above the core sit over what they call (the UI over the API it uses), innermost first
  for (let k = callerRows.length - 1; k >= 0; k--) {
    const [row, ry] = callerRows[k];
    const above = new Set(callerRows.slice(0, k + 1).flatMap(([r]) => r.map((e) => e.id)));
    const forced = {};
    for (const e of row) {
      const xs = [...neighbours(spec, e.id)].filter((n) => pos.has(n) && !above.has(n)).map((n) => center(pos.get(n))[0]);
      if (xs.length) forced[e.id] = mean(xs);
    }
    if (Object.keys(forced).length) placeUnder(spec, pos, row, ry, coreLeft, coreLeft + areaW, forced);
  }
  if (inner) {
    y += 70;
    frames.push(boundaryFrame(spec, lvl, [left + outer, coreTop, areaW + 2 * inner, y - coreTop]));
  }
  if (sysBottom.length) {
    y += ROW_GAP;
    for (const row of chunks(sysBottom, CORE_PER_ROW)) y += placeUnder(spec, pos, row, y, coreLeft, coreLeft + areaW) + ROW_GAP;
    y -= ROW_GAP;
  }
  if (nested) {
    y += 70;
    frames.unshift(systemFrame(spec, [left, sysTopY, areaW + 2 * inner + 2 * outer, y - sysTopY]));
  }

  placeRight(spec, pos, right, left + areaW + 2 * inner + 2 * outer + RIGHT_GAP, new Set(top.map((e) => e.id)), coreTop);
  return [pos, frames];
}

// ---------------------------------------------------------------- layout: deployment

/** Deployment nodes as nested boxes, each holding its container instances (elements first, then
 *  child nodes) in rows of up to three. Elements outside every node go in a column on the right. */
function layoutDeployment(spec) {
  // An item is "el:<id>" (an element) or "node:<id>" (a deployment node).
  const item = (kind, id) => `${kind}:${id}`;
  const split = (it) => {
    const k = it.indexOf(':');
    return [it.slice(0, k), it.slice(k + 1)];
  };
  const nodes = new Map(spec.nodes.map((n) => [n.id, n]));
  const children = new Map(spec.nodes.map((n) => [n.id, []]));
  const roots = [];
  const byId = new Map(spec.elements.map((e) => [e.id, e]));
  for (const e of spec.elements) if (e.node) children.get(e.node).push(item('el', e.id));
  for (const n of spec.nodes) (n.parent ? children.get(n.parent) : roots).push(item('node', n.id));
  const sizes = new Map();

  function measure(it) {
    const [kind, id] = split(it);
    if (kind === 'el') return sizeOf(byId.get(id));
    if (!sizes.has(id)) {
      const [w, h] = gridSize(children.get(id));
      sizes.set(id, [Math.max(w + 2 * NODE_PAD, 260), Math.max(h + NODE_PAD + NODE_LABEL, 200)]);
    }
    return sizes.get(id);
  }

  function ancestors(nid) {
    const out = [];
    while (nid) {
      out.push(nid);
      nid = nodes.get(nid).parent;
    }
    return out;
  }

  /** Which of these items holds element eid (the element itself, or the node it is deployed in). */
  function owner(eid, items) {
    const chain = byId.get(eid).node ? ancestors(byId.get(eid).node) : [];
    return items.find((it) => it === item('el', eid) || (it.startsWith('node:') && chain.includes(split(it)[1]))) ?? null;
  }

  /** Order items by the flow between them, like the core of the other views: what is called first on
   *  top, what it calls below. Two consecutive single-item rows share one row (Web Server and Web Browser). */
  function itemRows(items) {
    const flows = [];
    for (const r of forwardRels(spec)) {
      const a = owner(r.from, items);
      const b = owner(r.to, items);
      if (a && b && a !== b) flows.push([a, b]);
    }
    const called = new Set(flows.map(([, b]) => b));
    let depth = new Map(items.filter((i) => !called.has(i)).map((i) => [i, 0]));
    if (!depth.size) depth = new Map([[items[0], 0]]);
    const queue = [...depth.keys()];
    while (queue.length) {
      const cur = queue.shift();
      for (const [a, b] of flows) {
        if (a === cur && !depth.has(b)) {
          depth.set(b, depth.get(cur) + 1);
          queue.push(b);
        }
      }
    }
    const rows = [];
    const depths = [...new Set(items.map((i) => depth.get(i) ?? 0))].sort((a, b) => a - b);
    for (const d of depths) rows.push(...chunks(items.filter((i) => (depth.get(i) ?? 0) === d), NODE_PER_ROW));
    const merged = [];
    for (const row of rows) {
      if (merged.length && row.length === 1 && merged[merged.length - 1].length === 1) merged[merged.length - 1] = [...merged[merged.length - 1], ...row];
      else merged.push(row);
    }
    return merged;
  }

  function gridSize(items) {
    if (!items.length) return [0, 0];
    const rows = itemRows(items);
    const widths = rows.map((r) => sum(r.map((i) => measure(i)[0])) + NODE_GAP_X * (r.length - 1));
    const heights = rows.map((r) => Math.max(...r.map((i) => measure(i)[1])));
    return [Math.max(...widths), sum(heights) + NODE_GAP_Y * (rows.length - 1)];
  }

  const pos = new Map();
  const frames = [];

  /** Lay items out in rows inside a box of the given width starting at (x, y), rows centered. */
  function place(items, x, y, width, level) {
    if (!items.length) return;
    for (const r of itemRows(items)) {
      const rowW = sum(r.map((i) => measure(i)[0])) + NODE_GAP_X * (r.length - 1);
      const rowH = Math.max(...r.map((i) => measure(i)[1]));
      let cx = x + (width - rowW) / 2;
      for (const it of r) {
        const [w, h] = measure(it);
        const iy = y + (rowH - h) / 2;
        const [kind, id] = split(it);
        if (kind === 'el') {
          pos.set(id, [cx, iy, w, h]);
        } else {
          frames.push(nodeFrame(nodes.get(id), [cx, iy, w, h], level));
          place(children.get(id), cx + NODE_PAD, iy + NODE_PAD, w - 2 * NODE_PAD, level + 1);
        }
        cx += w + NODE_GAP_X;
      }
      y += rowH + NODE_GAP_Y;
    }
  }

  const left = PAD / 2;
  const [totalW] = gridSize(roots);
  place(roots, left, 0, totalW, 0);
  frames.sort((a, b) => a[5] - b[5]); // outer nodes first, so they sit behind inner ones
  const loose = spec.elements.filter((e) => !e.node);
  placeRight(spec, pos, loose, left + totalW + RIGHT_GAP, new Set(), 0);
  return [pos, frames.map((f) => f.slice(0, 5))];
}

function nodeFrame(node, box, level) {
  const tech = (node.technology || '').trim();
  const inst = node.instances;
  const name = node.name + ([undefined, null, '', 1, '1'].includes(inst) ? '' : ` x${inst}`);
  const label = STYLES.deployment_node.label;
  const row = { id: node.id, c4Name: name, c4Type: 'DeploymentNode', c4Application: 'Deployment Node', c4Technology: tech };
  const key = tech ? 'deployment_node' : 'deployment_node_notech';
  return [row, box, 'deployment_node', key, tech ? label : label.replace(': %c4Technology%', ''), level];
}

// ---------------------------------------------------------------- output

function labelFor(kind, technology) {
  const label = STYLES[kind].label;
  return technology ? label : label.replace(': %c4Technology%', '');
}

function relLabel(r, number = null) {
  const tech = (r.technology || '').trim();
  let text = (r.description || '').trim();
  if (number !== null) text = `${number}: ${text}`;
  return text + (tech ? `<br><font style='font-size: 9px'>[${tech}]</font>` : '');
}

/** '' for a normal floating arrow; a compass key for one half of a two-way pair. */
function edgeGroup(r, pos, pairs) {
  if (!pairs.has(key2(r.to, r.from))) return '';
  const [sx, sy] = center(pos.get(r.from));
  const [tx, ty] = center(pos.get(r.to));
  if (Math.abs(tx - sx) >= Math.abs(ty - sy)) return tx > sx ? 'E' : 'W';
  return ty > sy ? 'S' : 'N';
}

/** Rough width in pixels of a relationship label (11px text, 9px technology line). */
function labelWidth(r) {
  return Math.max(chars(r.description), chars(r.technology) * 0.8) * 5.4;
}

function overlap(a, b) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

/** {from\0to: LABEL_ANCHORS key} moving labels that would cover another label or an element.
 *  A label sits at the middle of its arrow; when that spot is taken it goes beside the line (left/right
 *  for steep arrows, above/below for flat ones), wherever it covers the least. */
function labelSides(rs, pos, pairs) {
  const taken = [];
  const out = new Map();
  for (const r of rs) {
    if (pairs.has(key2(r.to, r.from))) continue;
    const [sx, sy] = center(pos.get(r.from));
    const [tx, ty] = center(pos.get(r.to));
    const [mx, my] = [(sx + tx) / 2, (sy + ty) / 2];
    const w = labelWidth(r);
    const h = r.technology ? 28 : 15;
    const boxes = {
      '': [mx - w / 2, my - h / 2, w, h], U: [mx - w / 2, my - h - 3, w, h], D: [mx - w / 2, my + 3, w, h],
      L: [mx - w - 4, my - h / 2, w, h], R: [mx + 4, my - h / 2, w, h],
      LU: [mx - w - 4, my - h - 3, w, h], RD: [mx + 4, my + 3, w, h],
    };
    const flat = Math.abs(tx - sx) > 2 * Math.abs(ty - sy);
    const options = flat ? ['', 'U', 'D'] : ['', 'L', 'R', 'LU', 'RD', 'U', 'D'];
    const others = [...pos].filter(([k]) => k !== r.from && k !== r.to).map(([, b]) => b);
    const cost = (k) => sum(taken.map((b) => overlap(boxes[k], b))) * 2 + sum(others.map((b) => overlap(boxes[k], b)));
    let best = options[0];
    let bestCost = cost(best);
    for (const k of options.slice(1)) {
      const c = cost(k);
      if (c < bestCost) [best, bestCost] = [k, c];
    }
    taken.push(boxes[best]);
    if (best) out.set(key2(r.from, r.to), best);
  }
  return out;
}

function framesBbox(pos, frames) {
  const boxes = [...pos.values(), ...frames.map((f) => f[1])];
  const left = Math.min(...boxes.map((b) => b[0]));
  const bottom = Math.max(...boxes.map((b) => b[1] + b[3]));
  const width = Math.max(...boxes.map((b) => b[0] + b[2])) - left;
  return [left, bottom, width];
}

function defaultType(kind) {
  if (PERSON_KINDS.has(kind)) return 'Person';
  if (kind === 'system' || kind === 'external_system') return 'Software System';
  if (kind === 'component') return 'Component';
  if (kind === 'infrastructure_node') return 'Infrastructure Node';
  return 'Container';
}

export function build(spec) {
  validate(spec);
  warn(spec);
  const level = LEVELS[spec.level];
  const [pos, frames] = spec.level === 'deployment' ? layoutDeployment(spec) : layoutViews(spec);

  const rs = rels(spec);
  const pairs = new Set(rs.map((r) => key2(r.from, r.to)));
  const numbered = spec.level === 'dynamic';
  const fan = labelSides(rs, pos, pairs);
  const outgoing = new Map();
  rs.forEach((r, i) => {
    const g = edgeGroup(r, pos, pairs) || fan.get(key2(r.from, r.to)) || '';
    if (!outgoing.has(r.from)) outgoing.set(r.from, new Map());
    const byGroup = outgoing.get(r.from);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push([r, numbered ? (r.order ?? i + 1) : null]);
  });
  const groups = ['', ...Object.keys(PAIR_ANCHORS), ...Object.keys(LABEL_ANCHORS)];
  const counts = {};
  for (const g of groups) counts[g] = Math.max(0, ...[...outgoing.values()].map((v) => (v.get(g) || []).length));
  counts[''] = Math.max(counts[''], 1);

  const styles = {};
  const labels = {};
  const rows = [];
  const add = (row, box, styleKey, labelKey, label) => {
    const [x, y, w, h] = box;
    styles[styleKey] = STYLES[styleKey].style;
    labels[labelKey] = label;
    Object.assign(row, { stylename: styleKey, labelname: labelKey, x, y, w, h });
    rows.push(row);
  };

  const [left, bottom, width] = framesBbox(pos, frames);
  const title = spec.title || 'Diagram title';
  add({ id: 'title', c4Name: `${level.prefix}: ${title}`, c4Description: spec.description ?? '' },
    [left, bottom + 50, Math.max(520, width * 0.6), 44], level.title, 'title', STYLES[level.title].label);

  for (const frame of frames) add(...frame);

  for (const e of spec.elements) {
    const tech = (e.technology || '').trim();
    const row = {
      id: e.id, c4Name: e.name, c4Type: e.type || defaultType(e.kind), c4Technology: tech, c4Description: e.description ?? '',
    };
    for (const [g, items] of outgoing.get(e.id) || []) {
      items.forEach(([r, number], i) => {
        row[`to${g}${i + 1}`] = r.to;
        row[`rel${g}${i + 1}`] = relLabel(r, number);
      });
    }
    add(row, pos.get(e.id), e.kind, `${e.kind}${tech ? '' : '_notech'}`, labelFor(e.kind, tech));
  }

  const relCols = groups.flatMap((g) => Array.from({ length: counts[g] }, (_, i) => [`to${g}${i + 1}`, `rel${g}${i + 1}`]).flat());
  const cols = ['id', 'stylename', 'labelname', 'c4Name', 'c4Type', 'c4Technology', 'c4Description', 'c4Application',
    'x', 'y', 'w', 'h', ...relCols];
  for (const row of rows) for (const k of ['x', 'y', 'w', 'h']) row[k] = roundHalfEven(row[k]);
  const csv = [cols.join(','), ...rows.map((row) => cols.map((c) => csvField(row[c])).join(','))].join('\n') + '\n';

  const edge = STYLES.relationship.style;
  const anchors = { ...PAIR_ANCHORS, ...LABEL_ANCHORS };
  const connects = groups.flatMap((g) => Array.from({ length: counts[g] }, (_, i) => '# connect: ' + pyDumps({
    from: `to${g}${i + 1}`, to: 'id', fromlabel: `rel${g}${i + 1}`, style: edge + (anchors[g] || ''),
  }))).join('\n');
  const ignore = ['id', 'stylename', 'labelname', 'x', 'y', 'w', 'h', ...relCols].join(',');
  return `## Asto C4 - ${level.prefix}: ${title}
## draw.io: Arrange > Insert > Advanced > CSV..., replace the sample, paste everything and click Import.
#
# label: %c4Name%
# stylename: stylename
# styles: ${pyDumps(styles)}
# labelname: labelname
# labels: ${pyDumps(labels)}
# identity: id
# namespace: csvimport-
${connects}
# left: x
# top: y
# width: @w
# height: @h
# ignore: ${ignore}
# nodespacing: 40
# levelspacing: 100
# edgespacing: 40
# layout: none
## ---- CSV below this line. First line are column names. ----
${csv}`;
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const args = process.argv.slice(2);
  if (args.length !== 2) fail('usage: node build_csv.mjs spec.json output.txt');
  let spec;
  try {
    spec = JSON.parse(readFileSync(args[0], 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    fail(`cannot read ${args[0]}: ${err.message}`);
  }
  writeFileSync(args[1], build(spec), 'utf8');
  console.log(`wrote ${args[1]}`);
}
