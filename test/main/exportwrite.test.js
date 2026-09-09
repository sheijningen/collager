const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createExportWriter } = require('../../src/main/lib/exportwrite.js');

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collager-export-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('approve keeps image extensions and turns anything else into PNG', async () => {
  const writer = createExportWriter();
  assert.equal(await writer.approve('/x/a.png'), '/x/a.png');
  assert.equal(await writer.approve('/x/a.JPG'), '/x/a.JPG');
  assert.equal(await writer.approve('/x/a.jpeg'), '/x/a.jpeg');
  assert.equal(await writer.approve('/x/collage'), '/x/collage.png');
  assert.equal(await writer.approve('/x/collage.webp'), '/x/collage.webp.png');
  assert.equal(await writer.approve(null), null);
  assert.equal(await writer.approve(''), null);
});

test('writing without an approval is refused and creates nothing', async (t) => {
  const dir = tmpDir(t);
  const writer = createExportWriter();
  const target = path.join(dir, 'never.png');
  await assert.rejects(writer.writeChunk(target, new Uint8Array([1]), true), /save dialog/);
  assert.ok(!fs.existsSync(target));
});

test('an approved path is written from ordered chunks and the approval is consumed', async (t) => {
  const dir = tmpDir(t);
  const writer = createExportWriter();
  const target = await writer.approve(path.join(dir, 'out.png'));
  await writer.writeChunk(target, new Uint8Array([1, 2, 3]), false);
  await writer.writeChunk(target, new Uint8Array([4, 5]), false);
  await writer.writeChunk(target, new Uint8Array([6]), true);
  assert.deepEqual([...fs.readFileSync(target)], [1, 2, 3, 4, 5, 6]);
  await assert.rejects(writer.writeChunk(target, new Uint8Array([9]), true), /save dialog/);
  assert.deepEqual([...fs.readFileSync(target)], [1, 2, 3, 4, 5, 6], 'file untouched');
});

test('a chunk for a different path than the approved one is refused', async (t) => {
  const dir = tmpDir(t);
  const writer = createExportWriter();
  await writer.approve(path.join(dir, 'ok.png'));
  const other = path.join(dir, 'other.png');
  await assert.rejects(writer.writeChunk(other, new Uint8Array([1]), true), /save dialog/);
  assert.ok(!fs.existsSync(other));
});

test('mid-write chunks must keep addressing the file being written', async (t) => {
  const dir = tmpDir(t);
  const writer = createExportWriter();
  const target = await writer.approve(path.join(dir, 'out.png'));
  await writer.writeChunk(target, new Uint8Array([1]), false);
  await assert.rejects(
    writer.writeChunk(path.join(dir, 'else.png'), new Uint8Array([2]), true),
    /another export/
  );
  await writer.writeChunk(target, new Uint8Array([2]), true);
  assert.deepEqual([...fs.readFileSync(target)], [1, 2]);
});

test('non-byte payloads are refused', async (t) => {
  const dir = tmpDir(t);
  const writer = createExportWriter();
  const target = await writer.approve(path.join(dir, 'out.png'));
  await assert.rejects(writer.writeChunk(target, 'text', true), /bytes/);
  await assert.rejects(writer.writeChunk(target, [1, 2], true), /bytes/);
});

test('abort removes a partially written file', async (t) => {
  const dir = tmpDir(t);
  const writer = createExportWriter();
  const target = await writer.approve(path.join(dir, 'partial.png'));
  await writer.writeChunk(target, new Uint8Array([1]), false);
  await writer.abort();
  assert.ok(!fs.existsSync(target));
  await writer.abort(); // idempotent
});

test('approving a new export discards an abandoned write', async (t) => {
  const dir = tmpDir(t);
  const writer = createExportWriter();
  const abandoned = await writer.approve(path.join(dir, 'abandoned.png'));
  await writer.writeChunk(abandoned, new Uint8Array([1]), false);
  const next = await writer.approve(path.join(dir, 'next.png'));
  assert.ok(!fs.existsSync(abandoned));
  await writer.writeChunk(next, new Uint8Array([7]), true);
  assert.deepEqual([...fs.readFileSync(next)], [7]);
});
