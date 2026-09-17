/**
 * Convert a string to a URL-safe slug.
 *
 * Non-ASCII characters are stripped (not transliterated or accent-folded),
 * so e.g. 'Café' becomes 'caf'.
 *
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
