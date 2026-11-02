/* Reads the first sheet of an Excel (.xlsx) file into rows of text, in the browser, with no library.
   An .xlsx file is a zip of XML files. We unzip with the built-in DecompressionStream and read the cells.
   Dates stored as Excel serial numbers are turned into dates later, by the roster checks. */

async function inflate(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

// Lists the files in a zip and returns a reader for each, from the central directory.
function unzipIndex(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip");
  const count = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true);
  const files = {}, dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    files[name] = async () => {
      const ln = v.getUint16(off + 26, true), lx = v.getUint16(off + 28, true), start = off + 30 + ln + lx;
      const data = buf.subarray(start, start + csize);
      return dec.decode(method === 0 ? data : await inflate(data));
    };
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m);
const texts = (xml) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => unxml(m[1])).join("");
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

export async function readXlsx(arrayBuffer) {
  const files = unzipIndex(new Uint8Array(arrayBuffer));
  // Find the first sheet in the workbook's own order.
  let sheetPath = null;
  if (files["xl/workbook.xml"] && files["xl/_rels/workbook.xml.rels"]) {
    const wb = await files["xl/workbook.xml"](), rels = await files["xl/_rels/workbook.xml.rels"]();
    const rid = (wb.match(/<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/) || [])[1];
    const rel = rid && [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`));
    const target = rel && (rel.match(/Target="([^"]+)"/) || [])[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  }
  if (!sheetPath || !files[sheetPath]) sheetPath = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))[0];
  if (!sheetPath) throw new Error("no sheet");
  const shared = files["xl/sharedStrings.xml"] ? [...(await files["xl/sharedStrings.xml"]()).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])) : [];
  const xml = await files[sheetPath]();
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] || "";
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1], t = (attrs.match(/\bt="(\w+)"/) || [])[1];
      const vv = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = "";
      if (t === "s") val = shared[+vv] ?? "";
      else if (t === "inlineStr") val = texts(inner);
      else if (t === "b") val = vv === "1" ? "TRUE" : "FALSE";
      else val = vv != null ? unxml(vv) : "";
      const i = ref ? colIndex(ref) : row.length;
      while (row.length < i) row.push("");
      row[i] = String(val).trim();
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c));
}
