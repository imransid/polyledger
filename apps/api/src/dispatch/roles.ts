import { Role } from '../generated/prisma/client.js';

/** Post delivery challans. */
export const DISPATCHERS: Role[] = [Role.OWNER, Role.MANAGER, Role.STOREKEEPER];

/** Everyone but operators and guards: read dispatch. */
export const DISPATCH_STAFF: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.SUPERVISOR,
  Role.STOREKEEPER,
];

/** See the challans waiting at the gate and pass them. */
export const GATE_KEEPERS: Role[] = [...DISPATCH_STAFF, Role.GUARD];

/** Reverse challans, and record and reverse customer returns. */
export const DISPATCH_MANAGERS: Role[] = [Role.OWNER, Role.MANAGER];
