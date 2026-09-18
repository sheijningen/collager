/* OS drops that carry no file paths: a drag out of a web page is explained,
 * anything else stays silent. */
module.exports = {
  name: 'drop',
  async run({ js, check }) {
    const outcome = await js(`(() => {
      const overlay = document.getElementById('drop-overlay');
      const drop = (fill) => {
        const data = new DataTransfer();
        fill(data);
        window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: data }));
        const overlayShown = !overlay.hidden;
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, cancelable: true }));
        return overlayShown;
      };
      const toast = () => (T.toastEl.hidden ? null : T.toastEl.textContent);
      T.toastEl.hidden = true;
      T.toastEl.textContent = '';
      const textOverlay = drop((data) => data.setData('text/plain', 'hello'));
      const textToast = toast();
      const linksOverlay = drop((data) => {
        data.setData('text/uri-list', 'https://example.org/picture.jpg');
        data.setData('text/html', '<img src="https://example.org/picture.jpg">');
      });
      const linksToast = toast();
      T.toastEl.hidden = true;
      const fileOverlay = drop((data) => {
        data.items.add(new File(['x'], 'picture.png', { type: 'image/png' }));
      });
      const fileToast = toast();
      return {
        textOverlay, textToast, linksOverlay, linksToast, fileOverlay, fileToast,
        overlayHidden: overlay.hidden
      };
    })()`);
    check(
      'a text drop shows no overlay and says nothing',
      !outcome.textOverlay && !outcome.textToast
    );
    check(
      'a drop of links shows the overlay and is explained',
      outcome.linksOverlay && /on this computer/.test(outcome.linksToast)
    );
    check(
      'a file without a location on disk is explained',
      outcome.fileOverlay && /on this computer/.test(outcome.fileToast)
    );
    check('the overlay is down after the drop', outcome.overlayHidden);
  }
};
