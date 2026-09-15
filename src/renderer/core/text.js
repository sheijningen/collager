/* Small text helpers shared by toasts, labels and dialogs. */

/* "1 item", "3 items", "2 missing files": a count followed by the noun in
 * the right number. Irregular plurals pass their own plural form. */
export function formatCount(count, noun, plural = `${noun}s`) {
  return `${count} ${count === 1 ? noun : plural}`;
}
