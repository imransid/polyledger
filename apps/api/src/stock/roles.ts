import { Role } from '../generated/prisma/client.js';

export const STOCK_READERS: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.STOREKEEPER,
  Role.SUPERVISOR,
];

export const STORE_STAFF: Role[] = [Role.OWNER, Role.MANAGER, Role.STOREKEEPER];

export const STOCK_MANAGERS: Role[] = [Role.OWNER, Role.MANAGER];
