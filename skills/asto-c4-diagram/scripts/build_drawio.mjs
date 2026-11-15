#!/usr/bin/env node
// Build a draw.io diagram (.drawio, Asto C4 notation) from a C4 diagram spec.
//
// Usage: node build_drawio.mjs spec.json output.drawio [--doc companion.md]
//
// --doc also writes a Markdown companion document: the views, the BIAN / ISO 20022 / TOGAF mapping and notes.
// Spec format: see ../references/spec-format.md. Needs only Node.js 18 or later (no packages).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = JSON.parse(readFileSync(join(HERE, '..', 'assets', 'asto-c4-styles.json'), 'utf8'));
const BIAN = JSON.parse(readFileSync(join(HERE, '..', 'assets', 'bian-service-landscape-v12.json'), 'utf8'));

// BIAN Service Domain (lower case) -> { name, domain, area }
const BIAN_INDEX = new Map();
for (const [area, domains] of Object.entries(BIAN.businessAreas)) {
  for (const [domain, sds] of Object.entries(domains)) {
    for (const name of sds) BIAN_INDEX.set(name.toLowerCase(), { name, domain, area });
  }
}

// Groups use the library's Group element (c4Name, c4Type).
STYLES.group_boundary = STYLES.group;

// BIAN Impact View: nested Business Area > Business Domain > Service Domain boxes.
const BIAN_BOX = {
  area: { app: 'BIAN Business Area', stroke: '#78909C', fill: '#F5F7F8', font: '#455A64' },
  domain: { app: 'BIAN Business Domain', stroke: '#90A4AE', fill: '#FFFFFF', font: '#546E7A' },
  sd: { app: 'BIAN Service Domain', stroke: '#F9A825', fill: '#FFF8E1', font: '#8D6E00' },
};
for (const [k, v] of Object.entries(BIAN_BOX)) {
  STYLES[`bian_${k}`] = {
    style: STYLES.deployment_node.style.replace('fillColor=none', `fillColor=${v.fill}`)
      .replace('strokeColor=#444444', `strokeColor=${v.stroke}`).replace('fontColor=#444444', `fontColor=${v.font}`),
    label: STYLES.deployment_node.label.replace(': %c4Technology%', ''),
  };
}

// Change status of an element in the project: the element is drawn in the status colour (outline, text and icon)
// and the legend says what each colour means. The colours stay clear of the C4 ones (blue, red, green, teal, grey).
const STATUS = {
  new: { color: '#7B1FA2', es: 'Nuevo en este proyecto', en: 'New in this project' },
  modified: { color: '#D35400', es: 'Modificado en este proyecto', en: 'Changed by this project' },
  out_of_scope: { color: '#9E9E9E', es: 'Fuera de alcance (contexto)', en: 'Out of scope (context)' },
};
const META_STATUS = {
  draft: { es: 'Borrador', en: 'Draft' }, review: { es: 'En revisión', en: 'In review' }, approved: { es: 'Aprobado', en: 'Approved' },
};
const ADR_STATUS = {
  proposed: { es: 'Propuesta', en: 'Proposed' }, accepted: { es: 'Aceptada', en: 'Accepted' },
  superseded: { es: 'Reemplazada', en: 'Superseded' }, deprecated: { es: 'Obsoleta', en: 'Deprecated' },
};
// Legend entries: [colour, dashed, es, en]. Only the ones used in the diagram are listed.
const LEGEND_TYPES = {
  person: ['#297E06', false, 'Persona', 'Person'],
  external_person: ['#1A849C', false, 'Persona externa', 'External person'],
  system: ['#1168BD', false, 'Sistema de software', 'Software system'],
  external_system: ['#BF101D', false, 'Sistema externo', 'External software system'],
  container: ['#1168BD', false, 'Contenedor', 'Container'],
  component: ['#1168BD', false, 'Componente', 'Component'],
  infrastructure_node: ['#444444', false, 'Nodo de infraestructura', 'Infrastructure node'],
  deployment_node: ['#444444', false, 'Nodo de despliegue', 'Deployment node'],
  group_boundary: ['#444444', 'dotted', 'Grupo', 'Group'],
  bian_area: ['#78909C', false, 'BIAN Business Area', 'BIAN Business Area', '#F5F7F8'],
  bian_domain: ['#90A4AE', false, 'BIAN Business Domain', 'BIAN Business Domain'],
  bian_sd: ['#F9A825', false, 'BIAN Service Domain', 'BIAN Service Domain', '#FFF8E1'],
};
const CONTAINER_KINDS = new Set(['container', 'web_browser', 'server_app', 'folder', 'database', 'bucket', 'message_bus', 'mobile_app']);
STYLES.legend = {
  style: 'text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacing=0;fontSize=11;fontColor=#4D4D4D;'
    + 'fontFamily=Helvetica;connectable=0;allowArrows=0;rotatable=0;metaEdit=1;',
};
const LEGEND_ROW = 26;
function legendRow([color, dashed, es, en, fill = '#FFFFFF'], lg) {
  const swatch = `<span style="display: inline-block; width: 22px; height: 12px; border: 1.5px ${dashed === true ? 'dashed' : dashed || 'solid'} ${color}; `
    + `border-radius: 3px; vertical-align: middle; background-color: ${fill}"></span>`;
  return `<div style="height: ${LEGEND_ROW}px; line-height: ${LEGEND_ROW}px">${swatch}&nbsp;&nbsp;&nbsp;${lg === 'en' ? en : es}</div>`;
}
const lang = (spec) => (spec.language === 'en' ? 'en' : 'es');

const FRAMEWORKS = new Set(['c4', 'bian', 'iso20022', 'togaf', 'tmforum', 'acord', 'fhir']);
const GROUP_PAD = 18;
const GROUP_LABEL = 38;

// ISO 20022 message definitions most used in payments, for the companion document.
const ISO20022 = {
  'pain.001': 'Customer Credit Transfer Initiation', 'pain.002': 'Customer Payment Status Report',
  'pain.007': 'Customer Payment Reversal', 'pain.008': 'Customer Direct Debit Initiation',
  'pain.013': 'Creditor Payment Activation Request', 'pain.014': 'Creditor Payment Activation Request Status Report',
  'pacs.002': 'FI To FI Payment Status Report', 'pacs.003': 'FI To FI Customer Direct Debit',
  'pacs.004': 'Payment Return', 'pacs.007': 'FI To FI Payment Reversal',
  'pacs.008': 'FI To FI Customer Credit Transfer', 'pacs.009': 'Financial Institution Credit Transfer',
  'pacs.028': 'FI To FI Payment Status Request',
  'camt.029': 'Resolution Of Investigation', 'camt.052': 'Bank To Customer Account Report',
  'camt.053': 'Bank To Customer Statement', 'camt.054': 'Bank To Customer Debit Credit Notification',
  'camt.056': 'FI To FI Payment Cancellation Request', 'camt.060': 'Account Reporting Request',
  'acmt.023': 'Identification Verification Request', 'acmt.024': 'Identification Verification Report',
  'admi.002': 'Message Reject', 'head.001': 'Business Application Header',
};
const ISO_PATTERN = /\b(pain|pacs|camt|acmt|admi|head|remt|reda|auth|caaa|cain|catm|catp|colr|fxtr|seev|semt|sese|setr|trea|tsin|tsmt|secl|reda)\.\d{3}(\.\d{3}\.\d{2})?\b/g;

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
  bian: { title: 'title_context', prefix: 'BIAN Impact View', boundary: null },
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

/** Escape text for an XML attribute. */
function xmlAttr(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '&#10;');
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
  for (const f of spec.frameworks || []) {
    if (!FRAMEWORKS.has(f)) fail(`unknown framework '${f}'; use some of ${JSON.stringify([...FRAMEWORKS])}`);
  }
  for (const e of spec.elements) {
    if (e.bian !== undefined) e.bian = bianDomain(e);
  }
  validateGroups(spec, ids);
  for (const e of spec.elements) {
    const statuses = [...Object.keys(STATUS), 'unchanged'];
    if (e.status !== undefined && !statuses.includes(e.status)) fail(`element ${e.id} has unknown status '${e.status}'; use one of ${JSON.stringify(statuses)}`);
  }
  if (spec.meta?.status !== undefined && !(spec.meta.status in META_STATUS)) fail(`meta.status must be one of ${JSON.stringify(Object.keys(META_STATUS))}`);
  for (const d of spec.decisions || []) {
    if (!d.title || !d.decision) fail(`every decision needs title and decision: ${JSON.stringify(d)}`);
    if (d.status !== undefined && !(d.status in ADR_STATUS)) fail(`decision '${d.title}' has unknown status '${d.status}'; use one of ${JSON.stringify(Object.keys(ADR_STATUS))}`);
  }
  if (level === 'bian' && !spec.elements.some((e) => e.bian)) fail('a BIAN Impact View needs elements with "bian" Service Domains');
  if (level === 'deployment') validateNodes(spec, ids);
  else if (LEVELS[shapeLevel(spec)].boundary && !spec.elements.some((e) => e.inside)) {
    fail('containers/components diagrams need at least one element with "inside": true');
  }
}

/** The official name of an element's BIAN Service Domain, or a failure that suggests the closest ones. */
function bianDomain(e) {
  const found = BIAN_INDEX.get(String(e.bian).trim().toLowerCase());
  if (found) return found.name;
  const words = String(e.bian).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const scored = [...BIAN_INDEX.values()]
    .map((sd) => [words.filter((w) => sd.name.toLowerCase().includes(w)).length, sd.name])
    .filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).slice(0, 5).map(([, n]) => n);
  fail(`element ${e.id}: '${e.bian}' is not a BIAN v${BIAN.version} Service Domain`
    + (scored.length ? `; closest: ${scored.join(', ')}` : '; see assets/bian-service-landscape-v12.json'));
}

function validateGroups(spec, elementIds) {
  if (spec.group_by !== undefined && spec.group_by !== 'bian') fail('group_by can only be "bian"');
  const groupIds = new Set();
  for (const g of spec.groups || []) {
    if (!g.id || !g.name) fail(`every group needs id and name: ${JSON.stringify(g)}`);
    if (groupIds.has(g.id) || elementIds.has(g.id) || RESERVED_IDS.has(g.id)) {
      fail(`group id '${g.id}' is duplicated or already used by an element`);
    }
    groupIds.add(g.id);
  }
  for (const e of spec.elements) {
    if (e.group && !groupIds.has(e.group)) fail(`element ${e.id} is in unknown group '${e.group}'`);
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
  for (const r of rs) {
    for (const m of (r.technology || '').matchAll(ISO_PATTERN)) {
      if (!ISO20022[m[0].slice(0, 8)]) warning(`${m[0]} on ${r.from} -> ${r.to}: check the ISO 20022 message name`);
    }
  }
  const fw = new Set(spec.frameworks || []);
  if (fw.has('bian')) {
    const stores = new Set(['database', 'bucket', 'message_bus', 'folder']);
    const untagged = spec.elements.filter((e) => e.inside && !e.bian && !stores.has(e.kind)).map((e) => e.id);
    if (untagged.length) {
      warning(`BIAN is applied but these elements have no "bian" Service Domain: ${untagged.join(', ')} `
        + '(fine for purely technical ones such as gateways)');
    }
  }
  if (['dynamic', 'deployment', 'bian'].includes(spec.level)) return;
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

/** BIAN Impact View: each element with a "bian" Service Domain goes inside nested Business Area >
 *  Business Domain > Service Domain boxes (laid out like deployment nodes, by flow). People and elements
 *  without a Service Domain go in the column on the right. */
function layoutBian(spec) {
  const nodes = [];
  const ids = new Map();
  const nodeFor = (key, make) => {
    if (!ids.has(key)) {
      const node = make(`bian${ids.size + 1}`);
      ids.set(key, node.id);
      nodes.push(node);
    }
    return ids.get(key);
  };
  const elements = spec.elements.map((e) => {
    if (!e.bian || PERSON_KINDS.has(e.kind)) return { ...e, node: undefined };
    const sd = BIAN_INDEX.get(e.bian.toLowerCase());
    const area = nodeFor(`a:${sd.area}`, (id) => ({ id, name: sd.area, bianBox: 'area' }));
    const domain = nodeFor(`d:${sd.domain}`, (id) => ({ id, name: sd.domain, bianBox: 'domain', parent: area }));
    const node = nodeFor(`s:${sd.name}`, (id) => ({ id, name: sd.name, bianBox: 'sd', parent: domain }));
    return { ...e, node };
  });
  // people go in a row above the boxes, each over what it uses; everything else as on a deployment diagram
  const people = elements.filter((e) => PERSON_KINDS.has(e.kind));
  const isPerson = new Set(people.map((e) => e.id));
  const [pos, frames] = layoutDeployment({
    ...spec, nodes, elements: elements.filter((e) => !isPerson.has(e.id)),
    relationships: rels(spec).filter((r) => !isPerson.has(r.from) && !isPerson.has(r.to)),
  });
  if (!people.length) return [pos, frames];
  const boxes = [...pos.values(), ...frames.map((f) => f[1])];
  const top = Math.min(...boxes.map((b) => b[1]));
  const left = Math.min(...boxes.map((b) => b[0]));
  const rowH = Math.max(...people.map((e) => sizeOf(e)[1]));
  const y = top - ROW_GAP - rowH;
  const target = (e) => {
    const xs = rels(spec).filter((r) => (r.from === e.id || r.to === e.id) && pos.has(r.from === e.id ? r.to : r.from))
      .map((r) => { const b = pos.get(r.from === e.id ? r.to : r.from); return b[0] + b[2] / 2; });
    return xs.length ? mean(xs) : left;
  };
  let next = -Infinity;
  for (const e of [...people].sort((a, b) => target(a) - target(b))) {
    const [w, h] = sizeOf(e);
    const x = Math.max(target(e) - w / 2, next);
    pos.set(e.id, [x, y + (rowH - h) / 2, w, h]);
    next = x + w + NODE_GAP_X;
  }
  return [pos, frames];
}

function nodeFrame(node, box, level) {
  if (node.bianBox) {
    const key = `bian_${node.bianBox}`;
    const row = { id: node.id, c4Name: node.name, c4Type: 'Group' };
    return [row, box, key, 'group', STYLES.group.label, level];
  }
  const tech = (node.technology || '').trim();
  const inst = node.instances;
  const name = node.name + ([undefined, null, '', 1, '1'].includes(inst) ? '' : ` x${inst}`);
  const label = STYLES.deployment_node.label;
  const row = { id: node.id, c4Name: name, c4Type: 'DeploymentNode', c4Application: 'Deployment Node', c4Technology: tech };
  const key = tech ? 'deployment_node' : 'deployment_node_notech';
  return [row, box, 'deployment_node', key, tech ? label : label.replace(': %c4Technology%', ''), level];
}

// ---------------------------------------------------------------- output

/** "Versión 1.0 · 2026-11-15 · Autor · Borrador" from spec.meta, or '' when there is none. */
function metaLine(spec) {
  const m = spec.meta || {};
  const lg = lang(spec);
  const parts = [m.version && `${lg === 'en' ? 'Version' : 'Versión'} ${m.version}`, m.date, m.author,
    m.status && META_STATUS[m.status][lg]].filter(Boolean);
  return parts.join(' · ');
}

function labelFor(kind, technology) {
  let label = STYLES[kind].label;
  if (!technology) label = label.replace(': %c4Technology%', '');
  return label;
}

/** Group boundaries around their members (explicit "groups", or "group_by": "bian" for BIAN Business Domains).
 *  A group is drawn only if its box holds no element from outside the group. */
function groupFrames(spec, pos) {
  const groups = [];
  if (spec.group_by === 'bian') {
    const byDomain = new Map();
    for (const e of spec.elements) {
      if (!e.bian || !e.inside) continue;
      const d = BIAN_INDEX.get(e.bian.toLowerCase()).domain;
      if (!byDomain.has(d)) byDomain.set(d, []);
      byDomain.get(d).push(e.id);
    }
    let n = 0;
    // a domain with a single element adds nothing: its BIAN tag already says it
    for (const [d, members] of byDomain) {
      if (members.length > 1) groups.push({ id: `group${++n}`, name: d, type: 'BIAN Business Domain', members });
    }
  }
  for (const g of spec.groups || []) {
    groups.push({ ...g, members: spec.elements.filter((e) => e.group === g.id).map((e) => e.id) });
  }
  const frames = [];
  for (const g of groups) {
    const boxes = g.members.filter((m) => pos.has(m)).map((m) => pos.get(m));
    if (!boxes.length) continue;
    const x0 = Math.min(...boxes.map((b) => b[0])) - GROUP_PAD;
    const y0 = Math.min(...boxes.map((b) => b[1])) - GROUP_PAD;
    const x1 = Math.max(...boxes.map((b) => b[0] + b[2])) + GROUP_PAD;
    const y1 = Math.max(...boxes.map((b) => b[1] + b[3])) + GROUP_LABEL;
    const box = [x0, y0, x1 - x0, y1 - y0];
    const intruders = [...pos].filter(([id, b]) => !g.members.includes(id) && overlap(box, b) > 0).map(([id]) => id);
    if (intruders.length) {
      warning(`group "${g.name}" not drawn: ${intruders.join(', ')} sit between its elements; the BIAN tags still show it`);
      continue;
    }
    const row = { id: g.id, c4Name: g.name, c4Type: 'Group', groupType: g.type || '' };
    frames.push([row, box, 'group_boundary', 'group', STYLES.group.label]);
  }
  return frames;
}

// The library's relationship labels, with and without technology.
const REL_LABEL = '<div>%c4Description%</div><div><font style="font-size: 9px">[%c4Technology%]</font></div>';
const REL_LABEL_NOTECH = '<div>%c4Description%</div>';

/** The properties a library element of this kind has, and nothing else. */
const ELEMENT_KEYS = {
  person: ['c4Name', 'c4Type', 'c4Description'],
  system: ['c4Name', 'c4Type', 'c4Description'],
  infrastructure_node: ['c4Name', 'c4Type', 'c4Technology'],
  container: ['c4Name', 'c4Type', 'c4Technology', 'c4Description'],
};
function elementKeys(kind) {
  if (PERSON_KINDS.has(kind)) return ELEMENT_KEYS.person;
  if (kind === 'system' || kind === 'external_system') return ELEMENT_KEYS.system;
  if (kind === 'infrastructure_node') return ELEMENT_KEYS.infrastructure_node;
  return ELEMENT_KEYS.container;
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

export function build(spec, { quiet = false } = {}) {
  validate(spec);
  if (!quiet) warn(spec);
  const level = LEVELS[spec.level];
  const layout = { deployment: layoutDeployment, bian: layoutBian }[spec.level] || layoutViews;
  const [pos, frames] = layout(spec);
  // with a BIAN Impact View page, the C4 view stays clean: no BIAN tags or BIAN groups on it
  const bianShown = spec.level === 'bian' || Boolean(bianPage(spec));
  if (spec.level !== 'deployment' && spec.level !== 'bian') {
    frames.push(...groupFrames(bianShown && spec.group_by === 'bian' ? { ...spec, group_by: undefined } : spec, pos));
  }

  const rs = rels(spec);
  const pairs = new Set(rs.map((r) => key2(r.from, r.to)));
  const numbered = spec.level === 'dynamic' || spec.numbered === true;
  const fan = labelSides(rs, pos, pairs);
  const outgoing = new Map();
  rs.forEach((r, i) => {
    const g = edgeGroup(r, pos, pairs) || fan.get(key2(r.from, r.to)) || '';
    if (!outgoing.has(r.from)) outgoing.set(r.from, new Map());
    const byGroup = outgoing.get(r.from);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push([r, numbered ? (r.order ?? i + 1) : null]);
  });

  const rows = [];
  const add = (row, box, styleKey, labelKey, label) => {
    rows.push({ row, box, style: STYLES[styleKey].style, label });
  };

  const [left, bottom, width] = framesBbox(pos, frames);
  const title = spec.title || 'Diagram title';
  const meta = metaLine(spec);
  const titleW = Math.max(520, width * 0.6);
  // document control goes after the description, in the title's own c4Description
  let description = (spec.description ?? '').trim();
  if (meta) description = description ? `${description}${/[.!?]$/.test(description) ? '' : '.'} ${meta}` : meta;
  const titleH = chars(description) * 6.5 > titleW ? 62 : 44;
  add({ id: 'title', c4Name: `${level.prefix}: ${title}`, c4Description: description },
    [left, bottom + 50, titleW, titleH], level.title, 'title', STYLES[level.title].label);

  for (const frame of frames) add(...frame);

  for (const e of spec.elements) {
    const tech = (e.technology || '').trim();
    // the BIAN Service Domain goes at the end of the description only when no BIAN Impact View shows it
    // (the BIAN page, or this diagram being that view): otherwise the C4 view stays clean
    let desc = (e.description ?? '').trim();
    if (e.bian && !PERSON_KINDS.has(e.kind) && !bianShown) desc = `${desc} (BIAN: ${e.bian})`.trim();
    const values = { c4Name: e.name, c4Type: e.type || defaultType(e.kind), c4Technology: tech, c4Description: desc };
    const row = { id: e.id };
    for (const k of elementKeys(e.kind)) row[k] = values[k];
    // a status recolours the element: every use of its C4 colour (outline, text, icon) takes the status colour
    const st = STATUS[e.status];
    const styleKey = st ? `${e.kind}_${e.status}` : e.kind;
    if (st && !STYLES[styleKey]) {
      const base = STYLES[e.kind].style.match(/strokeColor=(#[0-9A-Fa-f]{6})/)[1];
      STYLES[styleKey] = { style: STYLES[e.kind].style.replace(new RegExp(base, 'gi'), st.color) };
    }
    add(row, pos.get(e.id), styleKey, e.kind, labelFor(e.kind, tech));
  }

  // legend: the C4 colours and the status colours used in this diagram, bottom right
  if (spec.legend !== false) {
    const lg = lang(spec);
    const used = new Set(spec.elements.filter((e) => !STATUS[e.status])
      .map((e) => (CONTAINER_KINDS.has(e.kind) ? 'container' : e.kind)));
    for (const f of frames) if (LEGEND_TYPES[f[2]]) used.add(f[2]);
    // a group is named in the legend, so it can be found: its name if there is one, or the type they share
    const groupRows = frames.filter((f) => f[2] === 'group_boundary').map((f) => f[0]);
    const groupTypes = [...new Set(groupRows.map((r) => r.groupType))];
    const groupName = groupRows.length === 1 ? groupRows[0].c4Name : (groupTypes.length === 1 ? groupTypes[0] : '');
    const entries = Object.keys(LEGEND_TYPES).filter((k) => used.has(k)).map((k) => {
      const [c, d, es, en, fill] = LEGEND_TYPES[k];
      return k === 'group_boundary' && groupName ? [c, d, `${es}: ${groupName}`, `${en}: ${groupName}`, fill] : LEGEND_TYPES[k];
    });
    const statuses = Object.keys(STATUS).filter((k) => spec.elements.some((e) => e.status === k))
      .map((k) => [STATUS[k].color, false, STATUS[k].es, STATUS[k].en]);
    const title = (text, size) => `<div style="height: 30px; line-height: 30px"><b><font style="font-size: ${size}px">${text}</font></b></div>`;
    const html = title(lg === 'en' ? 'Legend' : 'Leyenda', 15) + entries.map((r) => legendRow(r, lg)).join('')
      + (statuses.length ? title(lg === 'en' ? 'Status in the project' : 'Estado en el proyecto', 12)
        + statuses.map((r) => legendRow(r, lg)).join('') : '');
    const lw = statuses.length ? 230 : 200;
    const lh = 34 + LEGEND_ROW * (entries.length + statuses.length) + (statuses.length ? 30 : 0);
    const lx = Math.max(left + width - lw, left + titleW + 40);
    add({ id: 'legend' }, [lx, bottom + 50, lw, lh], 'legend', 'legend', html);
  }

  return toDrawio(spec, `${level.prefix}: ${title}`, rows, rs, outgoing);
}

/** Write the diagram as a .drawio file: the library's elements with only their own properties, elements
 *  nested in the boundary, node or group that contains them, and the relationships as library edges. */
function toDrawio(spec, name, rows, rs, outgoing) {
  const area = (b) => b[2] * b[3];
  const inside = (a, b) => a !== b && a[0] >= b[0] - 0.5 && a[1] >= b[1] - 0.5
    && a[0] + a[2] <= b[0] + b[2] + 0.5 && a[1] + a[3] <= b[1] + b[3] + 0.5;
  const containers = rows.filter((r) => /container=1/.test(r.style));
  for (const r of rows) {
    const holders = containers.filter((c) => c !== r && inside(r.box, c.box) && area(c.box) > area(r.box));
    r.parent = holders.length ? holders.reduce((a, b) => (area(a.box) <= area(b.box) ? a : b)) : null;
  }
  // parents before their children
  const depth = (r) => (r.parent ? 1 + depth(r.parent) : 0);
  const ordered = [...rows].sort((a, b) => depth(a) - depth(b));
  const cells = [];
  for (const r of ordered) {
    const [x, y, w, h] = r.box.map(roundHalfEven);
    const [px, py] = r.parent ? r.parent.box.map(roundHalfEven) : [0, 0];
    const geometry = `<mxGeometry x="${x - px}" y="${y - py}" width="${w}" height="${h}" as="geometry"/>`;
    const parent = r.parent ? r.parent.row.id : '1';
    const attrs = Object.entries(r.row).filter(([k]) => k.startsWith('c4')).map(([k, v]) => ` ${k}="${xmlAttr(v)}"`).join('');
    if (attrs) {
      cells.push(`<object label="${xmlAttr(r.label)}" placeholders="1"${attrs} id="${xmlAttr(r.row.id)}">`
        + `<mxCell style="${xmlAttr(r.style)}" vertex="1" parent="${xmlAttr(parent)}">${geometry}</mxCell></object>`);
    } else {
      cells.push(`<mxCell id="${xmlAttr(r.row.id)}" value="${xmlAttr(r.label)}" style="${xmlAttr(r.style)}" vertex="1" `
        + `parent="${xmlAttr(parent)}">${geometry}</mxCell>`);
    }
  }
  const anchors = { ...PAIR_ANCHORS, ...LABEL_ANCHORS };
  let n = 0;
  for (const [from, byGroup] of outgoing) {
    for (const [g, items] of byGroup) {
      for (const [r, number] of items) {
        const tech = (r.technology || '').trim();
        let desc = (r.description || '').trim();
        if (number !== null) desc = `${number}: ${desc}`;
        const attrs = ` c4Type="Relationship" c4Description="${xmlAttr(desc)}"${tech ? ` c4Technology="${xmlAttr(tech)}"` : ''}`;
        cells.push(`<object label="${xmlAttr(tech ? REL_LABEL : REL_LABEL_NOTECH)}" placeholders="1"${attrs} id="rel${++n}">`
          + `<mxCell style="${xmlAttr(STYLES.relationship.style + (anchors[g] || ''))}" edge="1" parent="1" `
          + `source="${xmlAttr(from)}" target="${xmlAttr(r.to)}"><mxGeometry relative="1" as="geometry"/></mxCell></object>`);
      }
    }
  }
  return `  <diagram name="${xmlAttr(name)}" id="asto-c4-${spec.level}">
    <mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${cells.map((c) => `        ${c}`).join('\n')}
      </root>
    </mxGraphModel>
  </diagram>`;
}

/** With BIAN applied, the BIAN Impact View of the same elements goes on a second page of the file. */
function bianPage(spec) {
  if (spec.level === 'bian' || spec.level === 'deployment' || spec.bian_view === false) return null;
  if (!(spec.frameworks || []).includes('bian') || !spec.elements.some((e) => e.bian)) return null;
  const en = spec.language === 'en';
  const { boundary, system, group_by, groups, scope, ...rest } = spec;
  // technical elements (gateway, databases, queues: no Service Domain) are not capabilities: leave them out
  // and join what passed through them (app -> gateway -> payments becomes app -> payments)
  const technical = new Set(spec.elements.filter((e) => !e.bian && !PERSON_KINDS.has(e.kind)
    && e.kind !== 'external_system' && e.kind !== 'system').map((e) => e.id));
  const relationships = [];
  const seen = new Set();
  const push = (r) => {
    if (technical.has(r.from) || technical.has(r.to) || r.from === r.to || seen.has(key2(r.from, r.to))) return;
    seen.add(key2(r.from, r.to));
    relationships.push(r);
  };
  // keep the step numbers of a dynamic diagram
  const all = rels(spec).map((r, i) => ({ ...r, order: r.order ?? i + 1 }));
  for (const r of all) {
    if (!technical.has(r.to)) push(r);
    else for (const next of all.filter((n) => n.from === r.to)) push({ ...next, from: r.from, order: r.order, technology: '' });
  }
  return {
    ...rest,
    relationships,
    level: 'bian',
    numbered: spec.level === 'dynamic',
    description: en ? 'Where each element sits in the BIAN Service Landscape v12.0.'
      : 'Dónde se ubica cada elemento en el BIAN Service Landscape v12.0.',
    elements: spec.elements.filter((e) => !technical.has(e.id)).map(({ inside, in_system, group, ...e }) => e),
  };
}

/** The .drawio file: the diagram, plus the BIAN Impact View page when BIAN is applied. */
export function buildFile(spec) {
  const pages = [build(spec)];
  const bian = bianPage(spec);
  if (bian) pages.push(build(bian, { quiet: true }));
  return `<mxfile host="asto-c4">
${pages.join('\n')}
</mxfile>
`;
}

// ---------------------------------------------------------------- companion document

const TEXT = {
  es: {
    frameworks: 'Marcos de referencia aplicados', view: 'Vista', togafView: 'Ubicación en TOGAF',
    elements: 'Elementos', element: 'Elemento', type: 'Tipo C4', tech: 'Tecnología', description: 'Descripción',
    sd: 'BIAN Service Domain', bd: 'BIAN Business Domain', ba: 'BIAN Business Area',
    relationships: 'Relaciones', from: 'Desde', to: 'Hacia', what: 'Qué hace', iso: 'Mensajes ISO 20022',
    isoTitle: 'Mensajes ISO 20022 usados', message: 'Mensaje', name: 'Nombre',
    principles: 'Principios de arquitectura (TOGAF)', statement: 'Enunciado', rationale: 'Justificación', implications: 'Implicaciones',
    blocks: 'Building blocks (TOGAF)', abb: 'Architecture Building Block', sbb: 'Solution Building Block',
    notes: 'Observaciones y brechas', source: 'Fuente BIAN', diagram: 'Diagrama',
    importHint: 'Ábrelo en draw.io (Archivo > Abrir) o, para sumarlo a un diagrama abierto, Archivo > Importar desde > Dispositivo.',
    control: 'Control del documento', version: 'Versión', date: 'Fecha', author: 'Autor', docStatus: 'Estado',
    status: 'Estado en el proyecto', adrs: 'Decisiones de arquitectura (ADR)', adrStatus: 'Estado',
    context: 'Contexto', decision: 'Decisión', consequences: 'Consecuencias',
    statusNames: { new: 'Nuevo', modified: 'Modificado', unchanged: 'Sin cambio', out_of_scope: 'Fuera de alcance' },
    togafViews: {
      bian: 'Arquitectura de Negocio (fase B del ADM): impacto del proyecto en las capacidades del banco.',
      context: 'Arquitectura de Negocio y de Aplicaciones (fases B y C del ADM): el sistema en su entorno.',
      containers: 'Arquitectura de Aplicaciones y de Datos (fase C del ADM).',
      components: 'Arquitectura de Aplicaciones (fase C del ADM), en detalle.',
      dynamic: 'Arquitectura de Aplicaciones (fase C del ADM): comportamiento de un caso de uso.',
      deployment: 'Arquitectura Tecnológica (fase D del ADM).',
    },
  },
  en: {
    frameworks: 'Reference frameworks applied', view: 'View', togafView: 'Place in TOGAF',
    elements: 'Elements', element: 'Element', type: 'C4 type', tech: 'Technology', description: 'Description',
    sd: 'BIAN Service Domain', bd: 'BIAN Business Domain', ba: 'BIAN Business Area',
    relationships: 'Relationships', from: 'From', to: 'To', what: 'What it does', iso: 'ISO 20022 messages',
    isoTitle: 'ISO 20022 messages used', message: 'Message', name: 'Name',
    principles: 'Architecture principles (TOGAF)', statement: 'Statement', rationale: 'Rationale', implications: 'Implications',
    blocks: 'Building blocks (TOGAF)', abb: 'Architecture Building Block', sbb: 'Solution Building Block',
    notes: 'Observations and gaps', source: 'BIAN source', diagram: 'Diagram',
    importHint: 'Open it in draw.io (File > Open) or, to add it to an open diagram, File > Import from > Device.',
    control: 'Document control', version: 'Version', date: 'Date', author: 'Author', docStatus: 'Status',
    status: 'Status in the project', adrs: 'Architecture decisions (ADR)', adrStatus: 'Status',
    context: 'Context', decision: 'Decision', consequences: 'Consequences',
    statusNames: { new: 'New', modified: 'Modified', unchanged: 'Unchanged', out_of_scope: 'Out of scope' },
    togafViews: {
      bian: "Business Architecture (ADM phase B): impact of the project on the bank's capabilities.",
      context: 'Business and Application Architecture (ADM phases B and C): the system in its environment.',
      containers: 'Application and Data Architecture (ADM phase C).',
      components: 'Application Architecture (ADM phase C), in detail.',
      dynamic: 'Application Architecture (ADM phase C): behaviour of one use case.',
      deployment: 'Technology Architecture (ADM phase D).',
    },
  },
};

const FRAMEWORK_NAMES = {
  c4: 'C4 model (c4model.com)', bian: `BIAN Service Landscape v${BIAN.version}`, iso20022: 'ISO 20022',
  togaf: 'TOGAF Standard', tmforum: 'TM Forum (eTOM / ODA)', acord: 'ACORD', fhir: 'HL7 FHIR',
};

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`,
  ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

export function buildDoc(spec, fileName) {
  const t = TEXT[spec.language === 'en' ? 'en' : 'es'];
  const level = LEVELS[spec.level];
  const fw = ['c4', ...(spec.frameworks || []).filter((f) => f !== 'c4')];
  const byId = new Map(spec.elements.map((e) => [e.id, e]));
  const out = [`# ${level.prefix}: ${spec.title || ''}`, '', spec.description || '', ''];
  if (fileName) out.push(`**${t.diagram}:** \`${fileName}\`. ${t.importHint}`, '');
  const m = spec.meta || {};
  if (m.version || m.date || m.author || m.status) {
    out.push(`## ${t.control}`, '', table([t.version, t.date, t.author, t.docStatus],
      [[m.version || '', m.date || '', m.author || '', m.status ? META_STATUS[m.status][spec.language === 'en' ? 'en' : 'es'] : '']]), '');
  }
  out.push(`## ${t.frameworks}`, '', ...fw.map((f) => `- ${FRAMEWORK_NAMES[f] || f}`), '');
  if (fw.includes('togaf')) out.push(`**${t.togafView}:** ${t.togafViews[spec.level]}`, '');

  const withBian = spec.elements.some((e) => e.bian);
  const withStatus = spec.elements.some((e) => e.status);
  out.push(`## ${t.elements}`, '', table(
    [t.element, t.type, t.tech, t.description, ...(withStatus ? [t.status] : []), ...(withBian ? [t.sd, t.bd, t.ba] : [])],
    spec.elements.map((e) => {
      const sd = e.bian ? BIAN_INDEX.get(e.bian.toLowerCase()) : null;
      return [e.name, e.type || defaultType(e.kind), e.technology || '', e.description || '',
        ...(withStatus ? [t.statusNames[e.status || 'unchanged']] : []),
        ...(withBian ? [sd?.name || '', sd?.domain || '', sd?.area || ''] : [])];
    }),
  ), '');
  if (withBian) out.push(`${t.source}: ${BIAN.source}`, '');

  const isoOf = (r) => [...new Set([...(r.technology || '').matchAll(ISO_PATTERN)].map((m) => m[0]))];
  const rs = rels(spec);
  const withIso = rs.some((r) => isoOf(r).length);
  if (rs.length) {
    out.push(`## ${t.relationships}`, '', table(
      [t.from, t.to, t.what, t.tech, ...(withIso ? [t.iso] : [])],
      rs.map((r) => [byId.get(r.from).name, byId.get(r.to).name, r.description || '', r.technology || '',
        ...(withIso ? [isoOf(r).join(', ')] : [])]),
    ), '');
  }
  if (withIso) {
    const used = [...new Set(rs.flatMap(isoOf))].sort();
    out.push(`### ${t.isoTitle}`, '', table([t.message, t.name], used.map((m) => [m, ISO20022[m.slice(0, 8)] || '?'])), '');
  }

  const togaf = spec.togaf || {};
  if (togaf.principles?.length) {
    out.push(`## ${t.principles}`, '');
    for (const p of togaf.principles) {
      out.push(`### ${p.name}`, '', `- **${t.statement}:** ${p.statement || ''}`);
      if (p.rationale) out.push(`- **${t.rationale}:** ${p.rationale}`);
      if (p.implications) out.push(`- **${t.implications}:** ${p.implications}`);
      out.push('');
    }
  }
  if (togaf.building_blocks?.length) {
    out.push(`## ${t.blocks}`, '', table([t.abb, t.sbb, t.elements],
      togaf.building_blocks.map((b) => [b.abb, b.sbb, (b.elements || []).map((id) => byId.get(id)?.name || id).join(', ')])), '');
  }
  if (spec.decisions?.length) {
    out.push(`## ${t.adrs}`, '');
    spec.decisions.forEach((d, i) => {
      const id = d.id || `ADR-${String(i + 1).padStart(3, '0')}`;
      out.push(`### ${id}: ${d.title}`, '');
      if (d.status) out.push(`- **${t.adrStatus}:** ${ADR_STATUS[d.status][spec.language === 'en' ? 'en' : 'es']}`);
      if (d.context) out.push(`- **${t.context}:** ${d.context}`);
      out.push(`- **${t.decision}:** ${d.decision}`);
      if (d.consequences) out.push(`- **${t.consequences}:** ${d.consequences}`);
      out.push('');
    });
  }
  if (spec.notes?.length) out.push(`## ${t.notes}`, '', ...spec.notes.map((n) => `- ${n}`), '');
  return out.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const args = process.argv.slice(2);
  const docAt = args.indexOf('--doc');
  const docPath = docAt >= 0 ? args.splice(docAt, 2)[1] : null;
  if (args.length !== 2 || (docAt >= 0 && !docPath)) fail('usage: node build_drawio.mjs spec.json output.drawio [--doc companion.md]');
  let spec;
  try {
    spec = JSON.parse(readFileSync(args[0], 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    fail(`cannot read ${args[0]}: ${err.message}`);
  }
  writeFileSync(args[1], buildFile(spec), 'utf8');
  console.log(`wrote ${args[1]}`);
  if (docPath) {
    writeFileSync(docPath, buildDoc(spec, args[1].split(/[\\/]/).pop()), 'utf8');
    console.log(`wrote ${docPath}`);
  }
}
