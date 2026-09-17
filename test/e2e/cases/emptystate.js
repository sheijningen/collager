/* The empty collage offers an Add media files button that opens the same
 * file picker as the Files menu entry. The picker is stubbed in the main
 * process. */
const { dialog } = require('electron');

module.exports = {
  name: 'emptystate',
  async run({ js, check, waitFor, fixtures }) {
    const showOpenDialog = dialog.showOpenDialog;
    let options = null;
    dialog.showOpenDialog = async (_win, dialogOptions) => {
      options = dialogOptions;
      return { canceled: false, filePaths: [fixtures[0]] };
    };
    try {
      const shown = await js(`(() => {
        const button = document.getElementById('btn-empty-add');
        const visible = !document.getElementById('empty-state').hidden && button.offsetParent !== null;
        button.click();
        return visible;
      })()`);
      check('an empty collage shows the add button', shown);
      const added = await waitFor(async () => (await js('T.state.items.length')) === 1);
      check(
        'the button opens the file picker',
        options !== null && options.properties.includes('openFile')
      );
      check('the picked file is added', added);
      check(
        'the button goes with the empty state',
        await js(`document.getElementById('empty-state').hidden`)
      );
    } finally {
      dialog.showOpenDialog = showOpenDialog;
    }
  }
};
