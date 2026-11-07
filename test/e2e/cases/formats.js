/* SVG images and Matroska videos load, measure and show like the other formats. */
const fs = require('fs');
const path = require('path');
const { makeVideo } = require('../fixtures');

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">' +
  '<rect width="200" height="100" fill="#4f8cff"/></svg>';
// no size of its own: Chromium gives it its default 300px width at the aspect
// ratio of the viewBox
const VIEWBOX_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100">' +
  '<circle cx="50" cy="50" r="40"/></svg>';

module.exports = {
  name: 'formats',
  async run({ js, check, waitFor, workDir, fixtures }) {
    const dir = path.join(workDir, 'formats');
    fs.mkdirSync(dir, { recursive: true });
    const svg = path.join(dir, 'vector.svg');
    fs.writeFileSync(svg, SVG);
    const viewBoxSvg = path.join(dir, 'viewbox.svg');
    fs.writeFileSync(viewBoxSvg, VIEWBOX_SVG);
    const paths = [svg, viewBoxSvg];
    // the video fixture is only there when ffmpeg is
    const mkv = path.join(dir, 'clip.mkv');
    const hasVideo = fixtures.some((file) => file.endsWith('.mp4')) && makeVideo(mkv);
    if (hasVideo) paths.push(mkv);
    else console.log('# ffmpeg not available, skipping the mkv checks');

    await js(`T.addPaths(${JSON.stringify(paths)})`);
    const measured = await waitFor(() =>
      js(
        `T.state.items.length === ${paths.length} && T.state.items.every((item) => T.hasOwnDimensions(item))`
      )
    );
    const items = await js(`T.state.items.map((item) => ({
      path: item.path, hash: item.hash, type: item.type, w: item.w, h: item.h,
      missing: item.missing, unshowable: item.unshowable
    }))`);
    check('the files are added and measured', measured, JSON.stringify(items));

    const vector = items.find((item) => item.path === svg);
    check(
      'an SVG is an image with the size it declares',
      vector && vector.type === 'image' && vector.w === 200 && vector.h === 100,
      JSON.stringify(vector)
    );
    check(
      'its tile shows it on a light backdrop',
      vector &&
        (await waitFor(() =>
          js(`(() => {
            const image = T.tiles.get(${JSON.stringify(vector.hash)}).querySelector('img');
            return image?.naturalWidth === 200 && image.classList.contains('vector');
          })()`)
        ))
    );
    const unsized = items.find((item) => item.path === viewBoxSvg);
    check(
      'an SVG with only a viewBox keeps its aspect ratio at the default width',
      unsized && unsized.w === 300 && unsized.h === 75,
      JSON.stringify(unsized)
    );

    if (!hasVideo) return;
    const clip = items.find((item) => item.path === mkv);
    check(
      'an MKV is a video with its frame size',
      clip && clip.type === 'video' && clip.w === 160 && clip.h === 90 && !clip.unshowable,
      JSON.stringify(clip)
    );
    check(
      'its tile plays it',
      clip &&
        (await waitFor(() =>
          js(`T.tiles.get(${JSON.stringify(clip.hash)}).querySelector('video')?.videoWidth === 160`)
        ))
    );
  }
};
