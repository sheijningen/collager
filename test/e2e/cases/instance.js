/* A second launch against the same profile hands over to the running app.
 * The restore and focus of the window stay unchecked: neither is reliable
 * under xvfb without a window manager. */
const path = require('path');
const { spawn } = require('child_process');
const { app, BrowserWindow } = require('electron');

module.exports = {
  name: 'instance',
  async run({ check, workDir, waitFor }) {
    const script = path.join(__dirname, '..', 'second-instance.js');
    const userData = path.join(workDir, 'userdata');
    let handedOver = false;
    app.once('second-instance', () => {
      handedOver = true;
    });
    const exit = await new Promise((resolve) => {
      const child = spawn(process.execPath, [script, userData], { stdio: 'ignore' });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve('timed out');
      }, 15000);
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve(String(err));
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    check('the second instance exits at once', exit === 0, String(exit));
    check('the running app is told about it', await waitFor(() => handedOver, 2000));
    check(
      'the handover opens no extra window in the running app',
      BrowserWindow.getAllWindows().length === 1
    );
  }
};
