/* Change detection for the file panel list. */

/* Everything an entry shows, in display order: hash, path (name and title),
 * type (badge) and missing state, plus the sort mode. Two lists with the
 * same key render identically, so a render that changes none of these (a
 * resize, a column change) can leave the list DOM alone. Selection is not
 * part of the key; it is applied to the existing entries separately. */
export function buildListKey(items, sortMode) {
  const entries = items.map(
    (item) => `${item.hash}\t${item.path}\t${item.type}\t${item.missing ? '!' : ''}`
  );
  return `${sortMode}\n${entries.join('\n')}`;
}
