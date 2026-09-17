import { describe, expect, it } from 'vitest';
import { filterAndSortEmployees, formatEmployeeName, formatEmployeeNameLastFirst } from '@/lib/employee-name';

describe('team name display', () => {
  it.each([
    ['Smith, Jane L', 'Jane L Smith'],
    ['de la Cruz, Ana Maria', 'Ana Maria de la Cruz'],
    ["O’Neil-Smith, Jean", "Jean O’Neil-Smith"],
    ['Jane Smith', 'Jane Smith'],
    ['Molly', 'Molly'],
    ['  Smith,  Jane   L  ', 'Jane L Smith'],
    ['Smith, John, Jr.', 'John Smith Jr.'],
    ['John Smith, Jr.', 'John Smith, Jr.'],
    ['Smith,', 'Smith,'],
    ['', ''],
  ])('formats %j as %j', (stored, displayed) => {
    expect(formatEmployeeName(stored)).toBe(displayed);
  });

  const employees = Object.freeze([
    Object.freeze({ id: '1', display_name: 'Adams, Zoe', email: null }),
    Object.freeze({ id: '2', display_name: 'Jane Smith', email: 'jane@example.com' }),
    Object.freeze({ id: '3', display_name: 'Brown, Amy L', email: null }),
  ]);

  it('sorts by displayed name without changing stored records or order', () => {
    const result = filterAndSortEmployees(employees);
    expect(result.map(employee => employee.id)).toEqual(['3', '2', '1']);
    expect(result[0]).toBe(employees[2]);
    expect(employees.map(employee => employee.id)).toEqual(['1', '2', '3']);
    expect(employees[2].display_name).toBe('Brown, Amy L');
  });

  it.each(['amy l brown', 'Brown, Amy', '  AMY L BROWN  '])('finds a member by %j', query => {
    expect(filterAndSortEmployees(employees, query).map(employee => employee.id)).toEqual(['3']);
  });

  it('retains email search and handles no results', () => {
    expect(filterAndSortEmployees(employees, 'jane@example.com')).toEqual([employees[1]]);
    expect(filterAndSortEmployees(employees, 'missing')).toEqual([]);
  });
});

describe('surname-first name display', () => {
  it.each([
    ['Holli Braga', 'Braga, Holli'],
    ['Alize A Furtado', 'Furtado, Alize A'],
    ['Barbosa, Jen L', 'Barbosa, Jen L'],
    ['  Smith,  Jane   L  ', 'Smith, Jane L'],
    ['Smith, John, Jr.', 'Smith, John, Jr.'],
    ['John Smith Jr.', 'Smith, John Jr.'],
    ['John Smith, Jr.', 'John Smith, Jr.'],
    ["Jean O’Neil-Smith", "O’Neil-Smith, Jean"],
    ['Smith Jr.', 'Smith Jr.'],
    ['Test', 'Test'],
    ['Smith,', 'Smith'],
    ['', ''],
  ])('formats %j as %j', (stored, displayed) => {
    expect(formatEmployeeNameLastFirst(stored)).toBe(displayed);
  });

  it('orders a mixed-format roster by surname, first name', () => {
    const roster = ['Holli Braga', 'Molly Perry', 'Test', 'Barbosa, Jen L', 'Alize A Furtado', 'Bizarro, Lucia'];
    const labels = roster.map(formatEmployeeNameLastFirst).sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(['Barbosa, Jen L', 'Bizarro, Lucia', 'Braga, Holli', 'Furtado, Alize A', 'Perry, Molly', 'Test']);
  });
});
