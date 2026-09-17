/* Boots the app a second time against the profile in argv[2]. The instance
 * lock in main.js makes this process hand over to the running one and exit. */
const { app } = require('electron');

app.setPath('userData', process.argv[2]);
require('../../src/main/main.js');
