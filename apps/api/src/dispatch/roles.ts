import { Role } from '../generated/prisma/client.js';

/** Post delivery challans. */
export const DISPATCHERS: Role[] = [Role.OWNER, Role.MANAGER, Role.STOREKEEPER];

/** Everyone but operators: read dispatch and pass challans at the gate. */
export const DISPATCH_STAFF: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.SUPERVISOR,
  Role.STOREKEEPER,
];

/** Reverse challans, and record and reverse customer returns. */
export const DISPATCH_MANAGERS: Role[] = [Role.OWNER, Role.MANAGER];
