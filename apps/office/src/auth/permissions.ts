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
