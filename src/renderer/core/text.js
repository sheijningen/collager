/* Small text helpers shared by toasts, labels and dialogs. */

/* "1 item", "3 items", "2 missing files": a count followed by the noun in
 * the right number. Irregular plurals pass their own plural form. */
export function formatCount(count, noun, plural = `${noun}s`) {
  return `${count} ${count === 1 ? noun : plural}`;
}

const LISTED_FORMATS = 3; // a longer list wraps the toast onto a second line

/* "12 unsupported files skipped (.heic, .mov)": the formats tell the user
 * what to convert. */
function describeUnsupported(count, extensions) {
  const listed = extensions.slice(0, LISTED_FORMATS);
  const more = extensions.length - listed.length;
  if (more) listed.push(`+${more} more`);
  const formats = listed.length ? ` (${listed.join(', ')})` : '';
  return `${formatCount(count, 'unsupported file')} skipped${formats}`;
}

/* The toast after an add, one fragment per outcome that occurred. */
export function describeAddOutcome({
  added,
  duplicates,
  unsupportedCount,
  unsupportedExtensions,
  unreadableCount
}) {
  const parts = [];
  if (added) parts.push(`added ${added}`);
  if (duplicates) parts.push(`${formatCount(duplicates, 'duplicate')} skipped`);
  if (unsupportedCount) parts.push(describeUnsupported(unsupportedCount, unsupportedExtensions));
  // a folder that could not be listed counts as one item
  if (unreadableCount) parts.push(`${formatCount(unreadableCount, 'item')} could not be read`);
  return parts.length ? parts.join(' · ') : 'Nothing to add';
}
