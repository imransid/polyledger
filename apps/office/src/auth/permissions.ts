import type { Role } from '@/api/types';

// The API's MASTER_DATA_EDITORS. Everyone else who reads master data sees
// it without create, edit or (de)activate buttons.
const MASTER_DATA_EDITORS: Role[] = ['OWNER', 'MANAGER'];

export function canEditMasterData(role: Role): boolean {
  return MASTER_DATA_EDITORS.includes(role);
}

// The API's STORE_STAFF and STOCK_MANAGERS. Supervisors read stock only.
/** Receive goods and move stock between locations. */
export const STORE_STAFF: Role[] = ['OWNER', 'MANAGER', 'STOREKEEPER'];
/** Opening stock, adjustments and reversals. */
export const STOCK_MANAGERS: Role[] = ['OWNER', 'MANAGER'];

export function canManageStock(role: Role): boolean {
  return STOCK_MANAGERS.includes(role);
}

// The API's sales and production role lists.
/** Open sales orders. */
export const SALES_READERS: Role[] = [
  'OWNER',
  'MANAGER',
  'SUPERVISOR',
  'STOREKEEPER',
];
/** Create, change, confirm, cancel and close sales orders. */
export const SALES_EDITORS: Role[] = ['OWNER', 'MANAGER'];
/** Create, release, cancel and close job cards. */
export const JOB_PLANNERS: Role[] = ['OWNER', 'MANAGER'];
/** Start and stop machines; reverse shift and waste entries. */
export const FLOOR_LEADS: Role[] = ['OWNER', 'MANAGER', 'SUPERVISOR'];
/** Record shifts and waste; operators only their own. */
export const ENTRY_RECORDERS: Role[] = [
  'OWNER',
  'MANAGER',
  'SUPERVISOR',
  'OPERATOR',
];
/** Read summaries, suggestions, entries and the machine board. */
export const PRODUCTION_READERS: Role[] = [
  'OWNER',
  'MANAGER',
  'SUPERVISOR',
  'STOREKEEPER',
];

// The API's tablet role lists.
/** Register, re-pair and revoke tablets. */
export const DEVICE_ADMINS: Role[] = ['OWNER'];
/** Set tablet PINs. */
export const PIN_SETTERS: Role[] = ['OWNER', 'MANAGER'];
/** Review the tablet records the server refused. */
export const RECORD_REVIEWERS: Role[] = ['OWNER', 'MANAGER', 'SUPERVISOR'];

/** The home page dashboard. */
export const DASHBOARD_READERS: Role[] = ['OWNER', 'MANAGER'];

// The API's dispatch and scrap role lists.
/** Post delivery challans. */
export const DISPATCHERS: Role[] = ['OWNER', 'MANAGER', 'STOREKEEPER'];
/** Reverse challans; record and reverse customer returns. */
export const DISPATCH_MANAGERS: Role[] = ['OWNER', 'MANAGER'];
/** See the challans waiting at the gate and pass them. */
export const GATE_KEEPERS: Role[] = [
  'OWNER',
  'MANAGER',
  'SUPERVISOR',
  'STOREKEEPER',
  'GUARD',
];
/** Reverse grinding batches. */
export const GRINDING_REVERSERS: Role[] = ['OWNER', 'MANAGER', 'SUPERVISOR'];
/** Scrap products and sell scrap: everything with money in it. */
export const SCRAP_MANAGERS: Role[] = ['OWNER', 'MANAGER'];
