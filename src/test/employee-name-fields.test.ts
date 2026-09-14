import { describe, expect, it } from 'vitest';
import { employeeNameFields, employeeNamePayload } from '@/lib/employee-name-fields';

describe('structured employee names', () => {
  it('requires first and last name, but not MI', () => {
    expect(employeeNamePayload({ first_name: 'Jane', middle_initial: '', last_name: 'Smith' }))
      .toEqual({ first_name: 'Jane', middle_initial: null, last_name: 'Smith', display_name: 'Jane Smith' });
    expect(() => employeeNamePayload({ first_name: '', middle_initial: '', last_name: 'Smith' })).toThrow('required');
    expect(() => employeeNamePayload({ first_name: 'Jane', middle_initial: '', last_name: ' ' })).toThrow('required');
  });
  it('normalizes an optional initial and rejects a full middle name', () => {
    expect(employeeNamePayload({ first_name: 'Jane', middle_initial: 'a.', last_name: 'Smith' }).display_name).toBe('Jane A Smith');
    expect(() => employeeNamePayload({ first_name: 'Jane', middle_initial: 'Anne', last_name: 'Smith' })).toThrow('one letter');
  });
  it('preserves compound names once stored as explicit parts', () => {
    const name = employeeNamePayload({ first_name: 'Ana Maria', middle_initial: '', last_name: 'de la Cruz' });
    expect(employeeNameFields(name)).toEqual({ first_name: 'Ana Maria', middle_initial: '', last_name: 'de la Cruz' });
  });
  it('prefills imported names and leaves missing surnames blank', () => {
    expect(employeeNameFields({ display_name: 'Smith, Jane L' })).toEqual({ first_name: 'Jane', middle_initial: 'L', last_name: 'Smith' });
    expect(employeeNameFields({ display_name: 'Jane' })).toEqual({ first_name: 'Jane', middle_initial: '', last_name: '' });
  });
});
