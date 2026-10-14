import { describe, expect, it } from 'vitest';
import { boardOrder, machineState } from './machine-board.js';

describe('machineState', () => {
  it('reads running, idle and repair from status and running card', () => {
    expect(machineState('ACTIVE', true)).toBe('RUNNING');
    expect(machineState('ACTIVE', false)).toBe('IDLE');
    expect(machineState('REPAIR', false)).toBe('REPAIR');
    expect(machineState('RETIRED', false)).toBeNull();
  });
});

describe('boardOrder', () => {
  it('puts running machines first, then idle, then repair, each by code', () => {
    const machines = [
      { state: 'REPAIR' as const, code: 'IM-01' },
      { state: 'IDLE' as const, code: 'IM-04' },
      { state: 'RUNNING' as const, code: 'IM-03' },
      { state: 'IDLE' as const, code: 'IM-02' },
    ];

    expect(machines.sort(boardOrder).map((m) => m.code)).toEqual([
      'IM-03',
      'IM-02',
      'IM-04',
      'IM-01',
    ]);
  });
});
