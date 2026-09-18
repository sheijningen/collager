/* Pure path text helpers. Paths come from both platforms, so both separators
 * count. */

export function basename(filePath) {
  return filePath.split(/[\\/]/).pop();
}
