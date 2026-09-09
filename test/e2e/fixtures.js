/* Media fixtures generated in code: solid-colour PNGs, a 1x1 GIF and, when
 * ffmpeg is installed, a one second test video. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = ~0;
  for (const b of buf) c = (c >>> 8) ^ crcTable[(c ^ b) & 0xff];
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

function makePng(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3);
    for (let x = 0; x < w; x++) {
      raw[off + 1 + x * 3] = r;
      raw[off + 2 + x * 3] = g;
      raw[off + 3 + x * 3] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// canonical 1x1 GIF
const GIF_1PX = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
);

/* Writes the fixture set into mediaDir: wide, tall and square PNGs, a GIF,
 * a byte-identical copy of the wide PNG under another name, and the video
 * when ffmpeg is available. Returns whether the video was written. */
function makeFixtures(mediaDir) {
  fs.writeFileSync(path.join(mediaDir, 'wide.png'), makePng(320, 180, [200, 40, 40]));
  fs.writeFileSync(path.join(mediaDir, 'tall.png'), makePng(150, 250, [40, 200, 40]));
  fs.writeFileSync(path.join(mediaDir, 'square.png'), makePng(200, 200, [40, 40, 200]));
  fs.writeFileSync(path.join(mediaDir, 'tiny.gif'), GIF_1PX);
  // duplicate content under a different name
  fs.writeFileSync(path.join(mediaDir, 'wide-copy.png'), makePng(320, 180, [200, 40, 40]));

  const ffmpeg = spawnSync('ffmpeg', [
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=duration=1:size=160x90:rate=10',
    '-pix_fmt',
    'yuv420p',
    '-y',
    path.join(mediaDir, 'clip.mp4')
  ]);
  if (ffmpeg.status === 0) return true;
  console.log('# ffmpeg not available, skipping the video fixture');
  return false;
}

module.exports = { makePng, makeFixtures };
