type Employee = { id: string; user_id: string | null; display_name: string; name_aliases?: string[] | null };

export function employeeNameKey(name: string): string {
  const parts = name.trim().split(',').map(part => part.trim());
  const ordered = parts.length === 2 && parts[0] && parts[1] && !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[1])
    ? `${parts[1]} ${parts[0]}` : name;
  return ordered.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Multiple people with the same name remain ambiguous; aliases never select a person by guesswork. */
export function employeeNameIndex(employees: Employee[]) {
  const index = new Map<string, { id: string; user_id: string | null }[]>();
  for (const employee of employees) {
    for (const name of [employee.display_name, ...(employee.name_aliases ?? [])]) {
      const key = employeeNameKey(name);
      if (!key) continue;
      const matches = index.get(key) ?? [];
      if (!matches.some(match => match.id === employee.id)) matches.push({ id: employee.id, user_id: employee.user_id });
      index.set(key, matches);
    }
  }
  return index;
}
