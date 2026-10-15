import { describe, expect, it } from 'vitest';
import { changesOf } from './pull.js';

const rows = [
  { id: 'a', active: true },
  { id: 'b', active: false },
];
const active = (row: { active: boolean }) => row.active;
const id = (row: { id: string }) => ({ id: row.id });

describe('changesOf', () => {
  it('sends what the tablet keeps as created on the first pull, and nothing to delete', () => {
    expect(changesOf(rows, true, active, id)).toEqual({
      created: [{ id: 'a' }],
      updated: [],
      deleted: [],
    });
  });

  it('sends kept rows as updated later, and rows that left the list as deleted', () => {
    expect(changesOf(rows, false, active, id)).toEqual({
      created: [],
      updated: [{ id: 'a' }],
      deleted: ['b'],
    });
  });
});
