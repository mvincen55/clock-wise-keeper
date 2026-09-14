/** Display imported "Last, First Middle" names in first-name-first order.
 * Keep stored names intact: attendance imports match against the original value.
 * Names without a comma are already display-ready; never guess their word order.
 */
export function formatEmployeeName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  const parts = clean.split(',').map(part => part.trim());
  const [family, given, ...suffixes] = parts;
  if (!family || !given || /^(?:jr\.?|sr\.?|ii|iii|iv|v)$/i.test(given)) return clean;
  return [given, family, ...suffixes].filter(Boolean).join(' ');
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
