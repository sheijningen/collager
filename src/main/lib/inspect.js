const fsp = require('fs').promises;
const { typeForPath } = require('./scan');

const SIGNATURE_BYTES = 8; // shown in the report; nameFormat reads the whole header
const HEADER_BYTES = 12; // read from the file: enough for RIFF and ftyp brands

/* Formats that announce themselves in the first bytes. */
const SIGNATURES = [
  { name: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: 'JPEG', bytes: [0xff, 0xd8, 0xff] },
  { name: 'GIF', text: 'GIF8' },
  { name: 'BMP', text: 'BM' },
  { name: 'TIFF', bytes: [0x49, 0x49, 0x2a, 0x00] },
  { name: 'TIFF', bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { name: 'Photoshop', text: '8BPS' },
  { name: 'PDF', text: '%PDF' },
  { name: 'ZIP', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: 'Matroska or WebM', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { name: 'HTML', text: '<!DOCTYPE' },
  { name: 'HTML', text: '<html' },
  { name: 'XML', text: '<?xml' }
];

/* The families behind an ISO base media file, by the brand after "ftyp". */
const FTYP_FAMILIES = [
  { name: 'HEIF', brands: ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'] },
  { name: 'AVIF', brands: ['avif', 'avis'] },
  { name: 'QuickTime', brands: ['qt  '] },
  { name: '3GPP', brands: ['3gp4', '3gp5', '3gp6', '3gp7', '3ge6', '3gg6'] }
];

function matches(header, signature) {
  const expected = signature.text ? [...Buffer.from(signature.text, 'latin1')] : signature.bytes;
  if (header.length < expected.length) return false;
  return expected.every((byte, index) => header[index] === byte);
}

function isPrintableAscii(byte) {
  return (byte >= 0x20 && byte < 0x7f) || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

/* The format the first bytes of a file announce, or what they look like when
 * they announce none: "PNG", "ftyp heic, HEIF", "RIFF WEBP", "text",
 * "no known media signature". */
function nameFormat(header) {
  for (const signature of SIGNATURES) {
    if (matches(header, signature)) return signature.name;
  }
  if (header.length >= 12 && header.toString('latin1', 4, 8) === 'ftyp') {
    const brand = header.toString('latin1', 8, 12);
    const family = FTYP_FAMILIES.find((candidate) => candidate.brands.includes(brand));
    return `ftyp ${brand.trim()}, ${family ? family.name : 'MP4 family'}`;
  }
  if (header.length >= 12 && header.toString('latin1', 0, 4) === 'RIFF') {
    return `RIFF ${header.toString('latin1', 8, 12).trim()}`;
  }
  if (header.length > 0 && [...header].every(isPrintableAscii)) return 'text';
  return 'no known media signature';
}

/* The size of a file and what its first bytes say, for the user to read:
 * "24 bytes, starts with 6e 6f 74 20 61 20 70 6e (text)". */
function describeFileContent(header, size) {
  if (size === 0) return 'empty file';
  // shrunk to nothing between the stat and the read
  if (header.length === 0) return `${size} bytes, nothing could be read from the start`;
  const shown = header.subarray(0, SIGNATURE_BYTES);
  const hex = [...shown].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
  return `${size} bytes, starts with ${hex} (${nameFormat(header)})`;
}

/* What the operating system says about a file the renderer could not show,
 * for the user to read. Resolves to `present` (whether a regular file is
 * there) and `detail`: the error of the stat or the read, or the file's size
 * and what its first bytes announce when it reads fine, which then points at
 * the content itself. The message is the raw one from Node, path included,
 * since that is what a search or a bug report needs. Only a path with a
 * media extension is looked at, so the renderer cannot use this to read the
 * start of any other file. */
async function inspectMediaFile(filePath) {
  if (typeof filePath !== 'string' || !typeForPath(filePath)) {
    return { present: false, detail: 'not a media path' };
  }
  let size;
  try {
    const stats = await fsp.stat(filePath);
    if (!stats.isFile()) return { present: false, detail: 'not a regular file' };
    size = stats.size;
  } catch (err) {
    return { present: false, detail: err.message };
  }
  let handle;
  try {
    handle = await fsp.open(filePath, 'r');
    const header = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0);
    return { present: true, detail: describeFileContent(header.subarray(0, bytesRead), size) };
  } catch (err) {
    return { present: true, detail: err.message };
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {}
    }
  }
}

module.exports = { inspectMediaFile, nameFormat };
