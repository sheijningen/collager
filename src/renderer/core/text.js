/* The user-facing text: toasts, labels, tooltips and dialog copy. */

import { basename } from './paths.js';

/* "1 item", "3 items", "2 missing files": a count followed by the noun in
 * the right number. Irregular plurals pass their own plural form. */
export function formatCount(count, noun, plural = `${noun}s`) {
  return `${count} ${count === 1 ? noun : plural}`;
}

/* What keeps an item from being shown: 'missing' when its file is gone,
 * 'unshowable' when the file is there but cannot be decoded, else null. */
export function fileProblem(item) {
  if (item.missing) return 'missing';
  if (item.unshowable) return 'unshowable';
  return null;
}

/* The placeholder text of a tile: the file name, prefixed by what is wrong. */
export function tileLabel(item, name) {
  const problem = fileProblem(item);
  if (problem === 'missing') return `missing: ${name}`;
  if (problem === 'unshowable') return `cannot be shown: ${name}`;
  return name;
}

/* The question before removing `subject` ("all 12 items", "3 missing files")
 * and the button that answers yes, so the choice is never a bare OK. */
export function describeRemoval(subject) {
  return {
    message: `Remove ${subject} from the collage?`,
    confirmLabel: `Remove ${subject}`
  };
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

const MISSING_FILE_HINT = [
  'This file could not be loaded. Likely causes:',
  '• it was moved or renamed',
  '• it was deleted',
  '• it is on an external drive or network share that is not connected',
  '',
  'Re-add the file from its new location to repair this entry, or click ✕ to remove it.'
].join('\n');

const UNSHOWABLE_FILE_HINT = [
  'This file is on disk but Collager cannot show it. Likely causes:',
  '• its format is not supported by the built-in player (HEVC/H.265 video, for example)',
  '• the file is damaged',
  '• it could not be read just now (a network drive that dropped out, for example)',
  '',
  'Open it with the default app from the right-click menu to check, or click ✕ to remove it.'
].join('\n');

/* The tooltip of a tile or list entry whose file has the given problem, or
 * an empty string when there is none. */
export function hintForFileProblem(problem) {
  if (problem === 'missing') return MISSING_FILE_HINT;
  if (problem === 'unshowable') return UNSHOWABLE_FILE_HINT;
  return '';
}

/* The badge on a file panel entry. */
export function badgeLabel(type) {
  if (type === 'image') return 'IMG';
  if (type === 'gif') return 'GIF';
  return 'VID';
}

/* The Collage menu entry that removes every missing item. The startup toast
 * points at it by this text, so both come from here. */
export function clearMissingLabel(count) {
  return `⚠ Clear ${count} missing`;
}

/* Toast for a library file that could not be loaded. It was moved aside,
 * or, when that failed or it could not be read at all, it stays where it is
 * and saving is off so it is not overwritten. */
export function describeLibraryProblem({ backup }) {
  const where = backup
    ? `It was kept as ${basename(backup)}.`
    : 'It stays where it is and saving is off to protect it.';
  return `The library file could not be read, starting empty. ${where}`;
}

/* The toast after the library has loaded, one note per thing worth knowing,
 * or an empty string when there is none. */
export function describeStartupNotes({ missingCount, collapsed }) {
  const notes = [];
  if (missingCount) {
    notes.push(
      `${formatCount(missingCount, 'file')} missing on disk, see Collage > ${clearMissingLabel(missingCount)}`
    );
  }
  if (collapsed) notes.push(`${formatCount(collapsed, 'duplicate')} merged`);
  return notes.join(' · ');
}
