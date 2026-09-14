import { describe, expect, it } from 'vitest';
import { employeeNameIndex, employeeNameKey } from '../../supabase/functions/confirm-import/employee-matching';

describe('employee identity across roster edits and imports', () => {
  it('matches an old import name to the same employee after a correction', () => {
    const index = employeeNameIndex([{ id: 'existing-employee', user_id: null, display_name: 'Jane A Smith', name_aliases: ['Smith, Jane L'] }]);
    expect(index.get(employeeNameKey('Smith, Jane L'))?.[0].id).toBe('existing-employee');
    expect(index.get(employeeNameKey('Jane A Smith'))?.[0].id).toBe('existing-employee');
  });
  it('matches either name order without making duplicate aliases ambiguous', () => {
    const index = employeeNameIndex([{ id: 'one', user_id: 'login-one', display_name: 'Jane L Smith', name_aliases: ['Smith, Jane L', 'JANE L SMITH'] }]);
    expect(index.get(employeeNameKey('Smith, Jane L'))).toEqual([{ id: 'one', user_id: 'login-one' }]);
  });
  it('leaves duplicate names ambiguous and unknown names unmatched', () => {
    const index = employeeNameIndex([
      { id: 'one', user_id: null, display_name: 'Jane Smith' },
      { id: 'two', user_id: null, display_name: 'Smith, Jane' },
    ]);
    expect(index.get(employeeNameKey('Jane Smith'))).toHaveLength(2);
    expect(index.get(employeeNameKey('Someone Else'))).toBeUndefined();
  });
});
