/* Status area: one line per running job, hidden while nothing runs. */
module.exports = {
  name: 'status',
  async run({ js, check }) {
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
  }
};
