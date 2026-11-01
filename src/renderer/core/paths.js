/* Pure path text helpers. Paths come from both platforms, so both separators
 * count. */

export function basename(filePath) {
  return filePath.split(/[\\/]/).pop();
}

/* The folder part of the path, without the trailing separator. */
export function dirname(filePath) {
  const cut = filePath.search(/[\\/][^\\/]*$/);
  if (cut < 0) return '';
  return cut === 0 ? filePath[0] : filePath.slice(0, cut);
}

/* The volume a path is on, as far as its text tells: a Windows drive or UNC
 * share, or a mount under one of the usual Linux locations. Null for a path
 * elsewhere. */
export function volumeRoot(filePath) {
  const match =
    filePath.match(/^\\\\[^\\]+\\[^\\]+/) ||
    filePath.match(/^[A-Za-z]:/) ||
    filePath.match(/^\/(?:media\/[^/]+|run\/media\/[^/]+|mnt|net|Volumes)\/[^/]+/);
  return match ? match[0] : null;
}

/* The URL to load a file by once its content changed under the same path:
 * the new hash as the query keeps Chromium from serving what it cached for
 * an earlier load of that path. */
export function urlForContent(url, hash) {
  return `${url.split('?')[0]}?${hash}`;
}
