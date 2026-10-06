import { describe, expect, it } from 'vitest';
import { employeeNameFields, employeeNamePayload } from '@/lib/employee-name-fields';

describe('structured employee names', () => {
  it('requires first and last name, but not MI', () => {
    expect(employeeNamePayload({ title: '', first_name: 'Jane', middle_initial: '', last_name: 'Smith' }))
      .toEqual({ title: null, first_name: 'Jane', middle_initial: null, last_name: 'Smith', display_name: 'Jane Smith' });
    expect(() => employeeNamePayload({ title: '', first_name: '', middle_initial: '', last_name: 'Smith' })).toThrow('required');
    expect(() => employeeNamePayload({ title: '', first_name: 'Jane', middle_initial: '', last_name: ' ' })).toThrow('required');
  });
  it('normalizes an optional initial and rejects a full middle name', () => {
    expect(employeeNamePayload({ title: '', first_name: 'Jane', middle_initial: 'a.', last_name: 'Smith' }).display_name).toBe('Jane A Smith');
    expect(() => employeeNamePayload({ title: '', first_name: 'Jane', middle_initial: 'Anne', last_name: 'Smith' })).toThrow('one letter');
  });
  it('preserves compound names once stored as explicit parts', () => {
    const name = employeeNamePayload({ title: '', first_name: 'Ana Maria', middle_initial: '', last_name: 'de la Cruz' });
    expect(employeeNameFields(name)).toEqual({ title: '', first_name: 'Ana Maria', middle_initial: '', last_name: 'de la Cruz' });
  });
  it('prefills imported names and leaves missing surnames blank', () => {
    expect(employeeNameFields({ display_name: 'Smith, Jane L' })).toEqual({ title: '', first_name: 'Jane', middle_initial: 'L', last_name: 'Smith' });
    expect(employeeNameFields({ display_name: 'Jane' })).toEqual({ title: '', first_name: 'Jane', middle_initial: '', last_name: '' });
  });
  it('names a doctor by title and first name, keeping the full name on the record', () => {
    expect(employeeNamePayload({ title: 'Dr.', first_name: 'Robert', middle_initial: '', last_name: 'Harelick' }))
      .toEqual({ title: 'Dr.', first_name: 'Robert', middle_initial: null, last_name: 'Harelick', display_name: 'Dr. Robert' });
    expect(employeeNamePayload({ title: 'Dr.', first_name: 'Jennie', middle_initial: 'L', last_name: 'Leikin' }).display_name).toBe('Dr. Jennie');
    expect(() => employeeNamePayload({ title: 'Prof.', first_name: 'Jane', middle_initial: '', last_name: 'Smith' })).toThrow('title');
    expect(() => employeeNamePayload({ title: 'Dr.', first_name: 'Robert', middle_initial: '', last_name: '' })).toThrow('required');
  });
  it('prefills a doctor from the record, or from a legacy "Dr. First" display name', () => {
    expect(employeeNameFields({ display_name: 'Dr. Robert', title: 'Dr.', first_name: 'Robert', middle_initial: null, last_name: 'Harelick' }))
      .toEqual({ title: 'Dr.', first_name: 'Robert', middle_initial: '', last_name: 'Harelick' });
    expect(employeeNameFields({ display_name: 'Dr. Robert' })).toEqual({ title: 'Dr.', first_name: 'Robert', middle_initial: '', last_name: '' });
    expect(employeeNameFields({ display_name: 'Dr. Nicole', title: null, first_name: 'Nicole', last_name: 'Balthazar' }).title).toBe('Dr.');
  });
});
