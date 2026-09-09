/* Startup with a saved library: stale entries are brought up to date, entries
 * that turn out to hold the same media merge, missing files stay, sizes are
 * filled in, the result reaches disk, and none of it mentions hashing. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

module.exports = {
  name: 'startup',
  async run({ js, check, waitFor, readLibraryWhen, workDir, fixtures, restartWith }) {
    const fixture = (name) => fixtures.find((f) => path.basename(f) === name);
    const wide = fixture('wide.png');
    const wideCopy = fixture('wide-copy.png');
    const tall = fixture('tall.png');
    const clip = fixture('clip.mp4');
    const library = [
      // up to date, and the copy below will collapse into it
      { path: wideCopy, hash: sha256(wide), type: 'image', size: fs.statSync(wide).size },
      // a copy that was still running when it was added: wrong hash, wrong size
      { path: wide, hash: 'partial-copy', type: 'image', size: 1 },
      // saved before sizes were recorded
      { path: tall, hash: sha256(tall), type: 'image' },
      { path: path.join(workDir, 'gone.png'), hash: 'gone', type: 'image', size: 9 }
    ];
    // a video entry from before sampled hashing
    if (clip) library.push({ path: clip, hash: 'full-content', type: 'video' });

    await restartWith(library);
    const count = library.length - 1;
    check(
      'the startup repair merged the finished copy',
      (await js('T.state.items.length')) === count
    );
    const paths = await js('T.state.items.map((i) => i.path)');
    check(
      'the up-to-date entry survived the merge',
      paths.includes(wideCopy) && !paths.includes(wide)
    );
    check(
      'the missing file stayed',
      await js(`T.state.items.some((i) => i.path.endsWith('gone.png') && i.missing)`)
    );

    const saved = await readLibraryWhen(count);
    check('the repaired library reached disk', saved !== null);
    const byPath = Object.fromEntries((saved || []).map((e) => [e.path, e]));
    check('the size was filled in', byPath[tall]?.size === fs.statSync(tall).size);
    if (clip) {
      check('the video moved to the sampled scheme', /^sampled-/.test(byPath[clip]?.hash));
    }

    const toast = await waitFor(async () => (await js('T.toastEl.textContent')).includes('merged'));
    check('the merge is reported', toast);
    const text = await js('T.toastEl.textContent');
    check('the missing file is reported alongside', text.includes('missing'));
    check('nothing shown mentions hashing', !/hash/i.test(text));
  }
};
