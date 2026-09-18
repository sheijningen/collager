/* Adding media: dedup by content, directory drops, persistence, clear all. */
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'library',
  async run({
    js,
    check,
    waitFor,
    readLibraryWhen,
    workDir,
    fixtures,
    expected,
    makePng,
    loadFixtures
  }) {
    await loadFixtures();
    check('drop adds all media once', (await js('T.state.items.length')) === expected);
    check('the add job finished', (await js('T.countRunningJobs()')) === 0);
    check(
      'duplicate content was skipped',
      (await js(`T.state.items.filter(i => /wide(-copy)?\\.png$/.test(i.path)).length`)) === 1
    );
    await js(`T.addPaths(${JSON.stringify([fixtures[0]])})`);
    check('re-adding is a no-op', (await js('T.state.items.length')) === expected);
    check('a no-op add still finishes its job', (await js('T.countRunningJobs()')) === 0);

    // dropping a directory adds its compatible files recursively
    const dropDir = path.join(workDir, 'dirdrop');
    fs.mkdirSync(path.join(dropDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dropDir, 'extra1.png'), makePng(60, 40, [250, 250, 40]));
    fs.writeFileSync(path.join(dropDir, 'nested', 'extra2.png'), makePng(40, 60, [40, 250, 250]));
    fs.writeFileSync(path.join(dropDir, 'nested', 'notes.txt'), 'not media');
    await js(`T.addPaths(${JSON.stringify([dropDir])})`);
    await waitFor(async () => (await js('T.state.items.length')) >= expected + 2);
    check(
      'dropping a directory adds nested compatible files',
      (await js('T.state.items.length')) === expected + 2
    );
    check(
      'incompatible files in the directory are skipped',
      (await js(`T.state.items.some(i => i.path.endsWith('notes.txt'))`)) === false
    );
    check(
      'the toast names the skipped format',
      (await js('T.toastEl.textContent')).includes('1 unsupported file skipped (.txt)')
    );

    // persistence: the library file holds every item with its dimensions
    const saved = await readLibraryWhen(expected + 2);
    check(
      'library persisted with dimensions',
      saved !== null && saved.every((i) => i.w > 0 && i.h > 0)
    );

    // clear all, and the removal reaches disk
    await js(`document.getElementById('btn-clear').click(); void 0`);
    check(
      'clear-all empties the collage',
      await waitFor(async () => (await js('T.state.items.length')) === 0)
    );
    check('empty state is shown again', await js(`!document.getElementById('empty-state').hidden`));
    check('clear-all is persisted', (await readLibraryWhen(0)) !== null);
  }
};
