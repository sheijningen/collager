/* A browser's image drag arrives as links, or as a file with no location on
 * disk; a drop of local files always yields paths. */
export function mayCarryMedia(types) {
  return types.includes('Files') || types.includes('text/uri-list');
}

/* What to tell the user when a drop yielded no paths, or null to stay silent. */
export function explainEmptyDrop(types, fileCount) {
  const cameFromElsewhere = types.includes('text/uri-list') || fileCount > 0;
  if (!cameFromElsewhere) return null;
  return 'Only files on this computer can be added. Save it to the computer first, then drop it again.';
}
