import { Role } from '../generated/prisma/client.js';

/** Send products to scrap, and sell scrap: anything with money in it. */
export const SCRAP_MANAGERS: Role[] = [Role.OWNER, Role.MANAGER];

/** Run the grinder and see its batches. */
export const SCRAP_STAFF: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.SUPERVISOR,
  Role.STOREKEEPER,
];

export const GRINDING_REVERSERS: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.SUPERVISOR,
];
