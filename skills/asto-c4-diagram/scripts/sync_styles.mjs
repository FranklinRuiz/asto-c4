#!/usr/bin/env node
// Regenerate assets/asto-c4-styles.json from the Asto C4 draw.io library.
//
// Run it after changing the library so diagrams built by the skill keep matching it:
//
//     node skills/asto-c4-diagram/scripts/sync_styles.mjs "Asto C4"
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'asto-c4-styles.json');

// Skill kind -> library entry title.
const ENTRIES = {
  person: 'Person', external_person: 'External Person',
  system: 'Software System', external_system: 'External Software System',
  container: 'Container', web_browser: 'Web Browser Container', server_app: 'Server-side App Container',
  folder: 'Folder Container', database: 'Data Container', bucket: 'Bucket Container',
  message_bus: 'Message Bus Container', mobile_app: 'Mobile App Container',
  component: 'Component', infrastructure_node: 'Infrastructure Node',
  system_boundary: 'System scope boundary', container_boundary: 'Container scope boundary',
  relationship: 'Relationship with description and technology',
  title_context: 'System context diagram title', title_containers: 'Containers diagram title',
  title_components: 'Components diagram title',
  deployment_node: 'Deployment node boundary',
  title_dynamic: 'Dynamic diagram title',
  title_deployment: 'Deployment diagram title',
};

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function unescapeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return String.fromCodePoint(n);
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

/** Library entries are either compressed (deflate + base64) or HTML-escaped XML. */
function decode(xml) {
  const s = xml.trimStart();
  if (s.startsWith('<')) return xml;
  if (s.startsWith('&lt;')) return unescapeHtml(xml);
  return decodeURIComponent(inflateRawSync(Buffer.from(xml, 'base64')).toString('utf8'));
}

function main(libraryPath) {
  const text = readFileSync(libraryPath, 'utf8');
  const match = text.match(/<mxlibrary>([\s\S]*)<\/mxlibrary>/);
  if (!match) throw new Error(`${libraryPath} is not a draw.io library`);
  const entries = new Map(JSON.parse(match[1]).map((e) => [e.title, e]));
  const out = {};
  for (const [kind, title] of Object.entries(ENTRIES)) {
    if (!entries.has(title)) {
      process.stderr.write(`error: the library has no entry titled '${title}'\n`);
      process.exit(1);
    }
    const entry = entries.get(title);
    const xml = decode(entry.xml);
    const label = xml.match(/<object label="([^"]*)"/);
    out[kind] = {
      title,
      style: xml.match(/style="([^"]*)"/)[1],
      label: label ? unescapeHtml(label[1]) : '',
      width: entry.w,
      height: entry.h,
    };
  }
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  console.log(`wrote ${OUT} (${Object.keys(out).length} styles)`);
}

if (process.argv.length !== 3) {
  process.stderr.write('usage: node sync_styles.mjs "path/to/Asto C4"\n');
  process.exit(1);
}
main(process.argv[2]);
