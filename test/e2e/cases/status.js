/* Status area: one line per running job, hidden while nothing runs, and the
 * progress of an add counting against the whole drop. */
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'status',
  async run({ js, check, waitFor, workDir, makePng }) {
    const status = await js(`(() => {
      const area = document.getElementById('status');
      const hiddenAtRest = area.hidden && T.countRunningJobs() === 0;
      const stackedAboveToast = area.nextElementSibling === T.toastEl;
      const first = T.startJob('First');
      const second = T.startJob('Second');
      second.update('step 2/5');
      const twoLines = !area.hidden && area.children.length === 2
        && area.children[1].textContent === 'Second: step 2/5';
      first.finish();
      const oneLeft = area.children.length === 1 && area.children[0].textContent === 'Second: step 2/5';
      second.finish();
      second.finish(); // finishing twice is harmless
      return {
        hiddenAtRest,
        stackedAboveToast,
        twoLines,
        oneLeft,
        hiddenAgain: area.hidden && T.countRunningJobs() === 0
      };
    })()`);
    check(
      'the status area is hidden while nothing runs',
      status.hiddenAtRest && status.hiddenAgain
    );
    check('each job owns its own line', status.twoLines && status.oneLeft);
    check('the status area sits above the toast', status.stackedAboveToast);

    // files before and after a folder: the read total must cover the folder
    const root = path.join(workDir, 'mixed-drop');
    const folder = path.join(root, 'folder');
    fs.mkdirSync(path.join(folder, 'nested'), { recursive: true });
    const media = [path.join(root, 'first.png'), path.join(root, 'last.png')];
    for (let index = 0; index < 30; index++) media.push(path.join(folder, `f${index}.png`));
    for (let index = 0; index < 5; index++)
      media.push(path.join(folder, 'nested', `n${index}.png`));
    media.forEach((file, index) => fs.writeFileSync(file, makePng(6, 6, [index, 90, 160])));
    fs.writeFileSync(path.join(folder, 'notes.txt'), 'not media');
    const dropped = [media[0], folder, media[1]];
    await js(`(() => {
      window.statusLog = [];
      window.statusObserver = new MutationObserver(() => {
        for (const line of document.getElementById('status').children) {
          window.statusLog.push(line.textContent);
        }
      });
      window.statusObserver.observe(document.getElementById('status'), {
        childList: true,
        subtree: true,
        characterData: true
      });
      T.addPaths(${JSON.stringify(dropped)});
    })()`);
    const added = await waitFor(async () => (await js('T.state.items.length')) === media.length);
    await js('T.queueLibraryOperation(() => {})');
    const log = await js('window.statusObserver.disconnect(), window.statusLog');
    const firstRead = log.findIndex((text) => text.startsWith('Adding: reading files'));
    const reads = log.filter((text) => text.startsWith('Adding: reading files'));
    check('a mixed drop is added in full', added);
    check(
      'the scan counts what it found before reading starts',
      log.slice(0, firstRead).some((text) => /^Adding: scanning, \d+ files? found$/.test(text)),
      log.slice(0, firstRead).join(' | ')
    );
    check(
      'every read counts against the whole drop',
      reads.length > 0 && reads.every((text) => text.endsWith(`/${media.length}`)),
      reads.join(' | ')
    );
  }
};
