/* Add a folder: the Files menu entry opens a directory picker and adds what
 * the chosen folder holds. The picker itself is stubbed in the main process. */
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

module.exports = {
  name: 'addfolder',
  async run({ js, check, waitFor, workDir, makePng }) {
    const folder = path.join(workDir, 'picked');
    fs.mkdirSync(path.join(folder, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'one.png'), makePng(50, 40, [10, 200, 100]));
    fs.writeFileSync(path.join(folder, 'nested', 'two.png'), makePng(40, 50, [100, 10, 200]));

    const showOpenDialog = dialog.showOpenDialog;
    let options = null;
    dialog.showOpenDialog = async (_win, dialogOptions) => {
      options = dialogOptions;
      return { canceled: false, filePaths: [folder] };
    };
    try {
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', shiftKey: true }))`);
      const added = await waitFor(async () => (await js('T.state.items.length')) === 2);
      check('Shift+A opens the folder picker', options !== null);
      check(
        'the picker asks for folders',
        options !== null && options.properties.includes('openDirectory')
      );
      check('the chosen folder is added recursively', added);

      options = null;
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      await js(`document.getElementById('btn-add-folder').click(); void 0`);
      await js('T.queueLibraryOperation(() => {})');
      check('cancelling adds nothing', (await js('T.state.items.length')) === 2);
    } finally {
      dialog.showOpenDialog = showOpenDialog;
    }
  }
};
