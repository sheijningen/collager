/* Files that failed are looked at again now and then, and one that is back
 * shows again. The rounds are driven by hand here with a clock far enough
 * ahead that every item is due. */
const fs = require('fs');
const path = require('path');

const FAR_AHEAD = 1e15;
const ROUND_APART = 1e12; // longer than any wait the schedule books

/* Writes the file dated a minute back, so a round does not take it for a
 * copy that is still running. */
function writeSettled(filePath, content) {
  fs.writeFileSync(filePath, content);
  settle(filePath);
}

function settle(filePath) {
  const written = new Date(Date.now() - 60_000);
  fs.utimesSync(filePath, written, written);
}

/* Deletes the file once nothing holds it open any more: Windows refuses the
 * delete while a load that just failed is still letting go. */
function deleteWhenFree(waitFor, filePath) {
  return waitFor(() => {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  });
}

module.exports = {
  name: 'retry',
  async run({ js, check, waitFor, workDir, makePng, loadFixtures, libraryFile, expected }) {
    const flaky = path.join(workDir, 'flaky.png');
    writeSettled(flaky, 'not a png yet');
    await js(`T.addPaths(${JSON.stringify([flaky])})`);
    const flagged = await waitFor(() =>
      js(`(() => {
        const item = T.state.items.find((i) => i.path.endsWith('flaky.png'));
        return item && item.unshowable === true;
      })()`)
    );
    check('a file that cannot be decoded is flagged', flagged);

    // the first round books the attempt, the next finds the file still broken
    const stillBroken = await js(`(async () => {
      await T.retryFailedFiles(${FAR_AHEAD});
      const recovered = await T.retryFailedFiles(${FAR_AHEAD + ROUND_APART});
      const item = T.state.items.find((i) => i.path.endsWith('flaky.png'));
      return recovered === 0 && item.unshowable === true
        && T.tiles.get(item.hash).classList.contains('unshowable');
    })()`);
    check('a file that still fails stays flagged after a retry', stillBroken);

    // a missing entry whose file is there but does not decode turns
    // unshowable without showing first
    const cameBack = await js(`(async () => {
      const item = T.state.items.find((i) => i.path.endsWith('flaky.png'));
      item.unshowable = false;
      item.missing = true;
      T.discardTile(item.hash);
      T.render();
      return T.retryFailedFiles(${FAR_AHEAD + 1.5 * ROUND_APART});
    })()`);
    const undecodable = await waitFor(() =>
      js(`(() => {
        const item = T.state.items.find((i) => i.path.endsWith('flaky.png'));
        return item.unshowable === true && !item.missing
          && T.tiles.get(item.hash).classList.contains('unshowable');
      })()`)
    );
    check(
      'a missing file that is there but undecodable turns unshowable',
      cameBack === 0 && undecodable
    );

    const deleted = await deleteWhenFree(waitFor, flaky);
    check('the broken file can be deleted', deleted);
    const gone = await js(`(async () => {
      await T.retryFailedFiles(${FAR_AHEAD + 1.75 * ROUND_APART});
      const item = T.state.items.find((i) => i.path.endsWith('flaky.png'));
      return item.missing === true && !item.unshowable
        && T.tiles.get(item.hash).classList.contains('missing');
    })()`);
    check('an unshowable file that is deleted turns missing', gone);

    // the file is back with other content: the entry takes the hash of what
    // the path holds now
    writeSettled(flaky, makePng(120, 80, [10, 120, 200]));
    const recovered = await js(`(async () => {
      const before = T.state.items.find((i) => i.path.endsWith('flaky.png')).hash;
      const recovered = await T.retryFailedFiles(${FAR_AHEAD + 2 * ROUND_APART});
      const item = T.state.items.find((i) => i.path.endsWith('flaky.png'));
      return {
        recovered,
        flagged: item.unshowable === true || item.missing === true,
        rehashed: item.hash !== before && !T.itemsByHash.has(before),
        hash: item.hash,
        dims: item.w === 120 && item.h === 80
      };
    })()`);
    check('a file that is back shows again', recovered.recovered === 1 && !recovered.flagged);
    check('it takes the hash of what the file holds now', recovered.rehashed);
    check('its size comes from the file, not the fallback of the failed add', recovered.dims);
    const shown = await waitFor(() =>
      js(`(() => {
        const tile = T.tiles.get(${JSON.stringify(recovered.hash)});
        return tile && tile.dataset.hydrated === '1' && tile.className === 'tile'
          && tile.querySelector('img') !== null;
      })()`)
    );
    check('the recovered file is shown in a plain tile', shown);
    const copy = path.join(workDir, 'flaky-copy.png');
    fs.copyFileSync(flaky, copy);
    await js(`T.addPaths(${JSON.stringify([copy])})`);
    const deduped = await js(`(() => {
      const li = T.listEntries.get(${JSON.stringify(recovered.hash)});
      return T.state.items.length === 1 && li && !li.classList.contains('unshowable');
    })()`);
    check('a copy of it is a duplicate and its panel entry is plain again', deduped);

    // an unshowable entry whose file decodes now shows again under its hash
    const decoded = await js(`(async () => {
      const item = T.itemsByHash.get(${JSON.stringify(recovered.hash)});
      item.unshowable = true;
      item.w = T.MISSING_W;
      item.h = T.MISSING_H;
      T.discardTile(item.hash);
      T.render();
      await T.retryFailedFiles(${FAR_AHEAD + 2.25 * ROUND_APART});
      const recovered = await T.retryFailedFiles(${FAR_AHEAD + 2.5 * ROUND_APART});
      return {
        recovered,
        plain: !item.unshowable && item.hash === ${JSON.stringify(recovered.hash)},
        dims: item.w === 120 && item.h === 80,
        tile: T.tiles.get(item.hash).className === 'tile'
      };
    })()`);
    check(
      'an unshowable file that decodes again shows again',
      decoded.recovered === 1 && decoded.plain && decoded.tile
    );
    check('with the dimensions the decode found', decoded.dims);

    // a missing file whose path now holds the content of another missing
    // entry: that entry takes the path and this one goes
    const pairA = path.join(workDir, 'pair-a.png');
    const pairB = path.join(workDir, 'pair-b.png');
    writeSettled(pairA, makePng(60, 40, [9, 9, 9]));
    writeSettled(pairB, makePng(200, 120, [8, 8, 8]));
    await js(`T.addPaths(${JSON.stringify([pairA, pairB])})`);
    const pairDeleted = await deleteWhenFree(waitFor, pairB);
    check('the second of two added files can be deleted', pairDeleted);
    writeSettled(pairA, makePng(200, 120, [8, 8, 8]));
    const merged = await js(`(async () => {
      const a = T.state.items.find((i) => i.path.endsWith('pair-a.png'));
      const b = T.state.items.find((i) => i.path.endsWith('pair-b.png'));
      for (const item of [a, b]) {
        item.missing = true;
        T.discardTile(item.hash);
      }
      T.render();
      await T.retryFailedFiles(${FAR_AHEAD + 2.6 * ROUND_APART});
      const recovered = await T.retryFailedFiles(${FAR_AHEAD + 2.7 * ROUND_APART});
      return {
        recovered,
        count: T.state.items.length,
        bAtA: b.path === ${JSON.stringify(pairA)} && !b.missing && b.w === 200 && b.h === 120,
        aGone: !T.state.items.includes(a)
      };
    })()`);
    check(
      'the entry already holding the content takes the file and the other entry goes',
      merged.recovered === 1 && merged.count === 2 && merged.bAtA && merged.aGone,
      JSON.stringify(merged)
    );
    await js(`T.removeItems((item) => !item.path.includes('pair-'))`);

    // a folder that is gone takes its files with it, an unshowable one
    // among them turning missing, and brings them back
    const folder = path.join(workDir, 'gone-folder');
    fs.mkdirSync(folder);
    const inFolder = ['one.png', 'two.png'].map((name) => path.join(folder, name));
    writeSettled(inFolder[0], makePng(30, 30, [5, 5, 5]));
    writeSettled(inFolder[1], makePng(31, 31, [6, 6, 6]));
    await js(`T.addPaths(${JSON.stringify(inFolder)})`);
    const folderDeleted =
      (await deleteWhenFree(waitFor, inFolder[0])) && (await deleteWhenFree(waitFor, inFolder[1]));
    const folderRemoved = await waitFor(() => {
      try {
        fs.rmdirSync(folder);
        return true;
      } catch {
        return false;
      }
    });
    const inFolderState = () =>
      js(`T.state.items
        .filter((i) => i.path.includes('gone-folder'))
        .map((i) => [i.missing === true, i.unshowable === true])`);
    await js(`(() => {
      const [one, two] = T.state.items.filter((i) => i.path.includes('gone-folder'));
      one.missing = true;
      two.unshowable = true;
      T.discardTile(one.hash);
      T.discardTile(two.hash);
      T.render();
    })()`);
    const whileGone = await js(`(async () => {
      await T.retryFailedFiles(${FAR_AHEAD + 2.8 * ROUND_APART});
      return T.retryFailedFiles(${FAR_AHEAD + 2.9 * ROUND_APART});
    })()`);
    const stillMissing = await inFolderState();
    check(
      'the files of a folder that is gone are missing, the unshowable one included',
      folderDeleted &&
        folderRemoved &&
        whileGone === 0 &&
        JSON.stringify(stillMissing) === '[[true,false],[true,false]]'
    );
    fs.mkdirSync(folder);
    writeSettled(inFolder[0], makePng(30, 30, [5, 5, 5]));
    writeSettled(inFolder[1], makePng(31, 31, [6, 6, 6]));
    const whenBack = await js(`T.retryFailedFiles(${FAR_AHEAD + 3.1 * ROUND_APART})`);
    const fineAgain = await inFolderState();
    check(
      'they show again once the folder is back',
      whenBack === 2 && JSON.stringify(fineAgain) === '[[false,false],[false,false]]'
    );
    await js(`T.removeItems((item) => !item.path.includes('gone-folder'))`);

    // a missing fixture that is back on disk shows again with its dimensions,
    // and a missing file whose path now holds content the library already
    // has (the wide image, kept under whichever of its two names came first)
    // leaves the library
    await loadFixtures();
    const twin = path.join(workDir, 'twin.png');
    fs.writeFileSync(twin, makePng(90, 90, [1, 2, 3]));
    await js(`T.addPaths(${JSON.stringify([twin])})`);
    const tallPath = await js(`(async () => {
      for (const name of ['tall.png', 'twin.png']) {
        const item = T.state.items.find((i) => i.path.endsWith(name));
        item.missing = true;
        delete item.w;
        delete item.h;
        T.discardTile(item.hash);
      }
      T.render();
      await T.persist();
      return T.state.items.find((i) => i.path.endsWith('tall.png')).path;
    })()`);
    fs.copyFileSync(path.join(path.dirname(tallPath), 'wide.png'), twin);
    settle(twin);
    settle(tallPath);
    const savedTall = () => {
      try {
        return JSON.parse(fs.readFileSync(libraryFile, 'utf8')).find(
          (item) => item.path === tallPath
        );
      } catch {
        return undefined;
      }
    };
    const unsized = await waitFor(() => {
      const entry = savedTall();
      return entry && entry.w === undefined && entry.h === undefined;
    });
    check('the entry is saved without a size first', unsized);
    const returned = await js(`(async () => {
      const item = T.state.items.find((i) => i.path === ${JSON.stringify(tallPath)});
      const badgeShown = !document.getElementById('missing-badge').hidden;
      const countBefore = T.state.items.length;
      await T.retryFailedFiles(${FAR_AHEAD + 3 * ROUND_APART});
      const recovered = await T.retryFailedFiles(${FAR_AHEAD + 4 * ROUND_APART});
      return {
        badgeShown,
        recovered,
        missing: item.missing,
        dims: item.w === 150 && item.h === 250,
        badgeHidden: document.getElementById('missing-badge').hidden,
        twinGone: T.state.items.length === countBefore - 1
          && !T.state.items.some((i) => i.path.endsWith('twin.png')),
        wideFine: ['missing', 'unshowable'].every(
          (flag) => !T.state.items.find((i) => /wide(-copy)?\\.png$/.test(i.path))[flag]
        )
      };
    })()`);
    check(
      'a missing file that is back shows again',
      returned.badgeShown && returned.recovered === 1 && !returned.missing,
      JSON.stringify(returned)
    );
    check('it gets its dimensions from the file', returned.dims);
    check('the missing count follows', returned.badgeHidden);
    check(
      'a missing entry whose path holds content the library already has goes',
      returned.twinGone && returned.wideFine
    );
    const saved = await waitFor(() => {
      const entry = savedTall();
      return entry && entry.w === 150 && entry.h === 250;
    });
    check('the dimensions are saved', saved);
    check(
      'the library holds the fixtures and the recovered file',
      expected + 1 === (await js('T.state.items.length'))
    );
  }
};
