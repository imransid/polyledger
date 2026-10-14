import type { MachineStatus } from '../../generated/prisma/client.js';

export type MachineState = 'RUNNING' | 'IDLE' | 'REPAIR';

const ORDER: MachineState[] = ['RUNNING', 'IDLE', 'REPAIR'];

// RUNNING: a job card is running on it. IDLE: active, but nothing running.
// REPAIR: out of use for now. Retired machines are not on the board.
export function machineState(
  status: MachineStatus,
  hasRunningCard: boolean,
): MachineState | null {
  if (status === 'RETIRED') {
    return null;
  }
  if (status === 'REPAIR') {
    return 'REPAIR';
  }
  return hasRunningCard ? 'RUNNING' : 'IDLE';
}

/** Running first, then idle, then in repair; by code within each. */
export function boardOrder(
  a: { state: MachineState; code: string },
  b: { state: MachineState; code: string },
): number {
  return (
    ORDER.indexOf(a.state) - ORDER.indexOf(b.state) ||
    a.code.localeCompare(b.code)
  );
}
