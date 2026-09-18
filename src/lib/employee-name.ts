const NAME_SUFFIX = /^(?:jr\.?|sr\.?|ii|iii|iv|v)$/i;

/** Display imported "Last, First Middle" names in first-name-first order.
 * Keep stored names intact: attendance imports match against the original value.
 * Names without a comma are already display-ready; never guess their word order.
 */
export function formatEmployeeName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  const parts = clean.split(',').map(part => part.trim());
  const [family, given, ...suffixes] = parts;
  if (!family || !given || NAME_SUFFIX.test(given)) return clean;
  return [given, family, ...suffixes].filter(Boolean).join(' ');
}

/** Display a name surname-first ("Last, First M") for lists people scan by last name,
 * such as the team-member picker. Stored "Last, First" names only get their spacing
 * tidied; "First M Last" names flip around their final word, keeping a trailing
 * suffix ("Jr.") after the given names. A single word has no surname to lead with and
 * is shown unchanged. Multi-word surnames without a comma ("Ana de la Cruz") flip on
 * the final word only: the explicit name fields, not guesswork, are the fix for those.
 */
export function formatEmployeeNameLastFirst(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.includes(',')) {
    return clean.split(',').map(part => part.trim()).filter(Boolean).join(', ');
  }
  const words = clean.split(' ');
  const suffix = words.length > 1 && NAME_SUFFIX.test(words.at(-1)!) ? words.pop() : undefined;
  if (words.length < 2) return clean;
  const family = words.pop();
  return [`${family}, ${words.join(' ')}`, suffix].filter(Boolean).join(' ');
}

export function filterAndSortEmployees<T extends { display_name: string; email?: string | null }>(
  employees: readonly T[],
  search = '',
): T[] {
  const query = search.trim().toLowerCase();
  return employees.filter(employee =>
    formatEmployeeName(employee.display_name).toLowerCase().includes(query) ||
    employee.display_name.toLowerCase().includes(query) ||
    employee.email?.toLowerCase().includes(query)
  ).sort((a, b) => formatEmployeeName(a.display_name).localeCompare(formatEmployeeName(b.display_name)));
}
