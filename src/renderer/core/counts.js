/* The file panel's media counter: how many items there are in total and how
 * that total splits over file extensions. */

import { basename } from './layout.js';

/* ".png", ".mp4": the extension of a file name, lowercased. A name with no
 * dot, or one that only starts with one, has no extension. */
export function extensionOf(filePath) {
  const name = basename(filePath);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return name.slice(dot).toLowerCase();
}

/* The total plus one entry per extension, biggest group first and ties in
 * alphabetical order. Files without an extension group under "no extension". */
export function countByExtension(items) {
  const counts = new Map();
  for (const item of items) {
    const extension = extensionOf(item.path) || 'no extension';
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }
  const extensions = [...counts]
    .map(([extension, count]) => ({ extension, count }))
    .sort(
      (first, second) =>
        second.count - first.count || first.extension.localeCompare(second.extension)
    );
  return { total: items.length, extensions };
}
