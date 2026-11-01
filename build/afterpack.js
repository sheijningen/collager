const { execFileSync } = require('child_process');
const path = require('path');

// Apple silicon will not run a bundle whose signature electron-builder's edits broke
function signAdHoc(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
}

module.exports = signAdHoc;
