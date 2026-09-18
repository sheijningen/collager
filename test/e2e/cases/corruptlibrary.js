/* A saved library that cannot be loaded: moved aside and reported when it
 * cannot be parsed, left alone with saving off when it cannot be read. */
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'corruptlibrary',
  async run({
    js,
    check,
    waitFor,
    restartWith,
    reloadRenderer,
    readLibraryWhen,
    libraryFile,
    fixtures
  }) {
    await restartWith('{not json');
    check('an unparseable library starts empty', (await js('T.state.items.length')) === 0);
    const toast = await js('T.toastEl.textContent');
    check(
      'the toast names the backup',
      toast.includes('could not be read') && toast.includes('library.json.corrupt')
    );
    const userData = path.dirname(libraryFile);
    const backups = fs
      .readdirSync(userData)
      .filter((name) => name.startsWith('library.json.corrupt'));
    check(
      'the content is kept in a backup',
      backups.some((name) => fs.readFileSync(path.join(userData, name), 'utf8') === '{not json')
    );
    check('the unparseable file is gone', !fs.existsSync(libraryFile));
    await js(`T.addPaths(${JSON.stringify([fixtures[0]])})`);
    check('saving resumes on a fresh file', (await readLibraryWhen(1)) !== null);

    // a file that is there but cannot be read: a directory in its place
    fs.rmSync(libraryFile);
    fs.mkdirSync(libraryFile);
    await reloadRenderer();
    check('an unreadable library starts empty', (await js('T.state.items.length')) === 0);
    check(
      'the toast says the file stays and saving is off',
      (await js('T.toastEl.textContent')).includes('stays where it is')
    );
    await js(`T.addPaths(${JSON.stringify([fixtures[0]])})`);
    const warned = await waitFor(async () =>
      (await js('T.toastEl.textContent')).includes('could not save')
    );
    check('a save is refused and reported', warned);
    check('the unreadable file is left alone', fs.statSync(libraryFile).isDirectory());
    // the store refuses saves until a clean load, which no reset performs, so
    // the case puts a readable library back itself
    fs.rmdirSync(libraryFile);
    await restartWith([]);
  }
};
