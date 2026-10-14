import { Role } from '../generated/prisma/client.js';

/** Create, release, cancel and close job cards. */
export const JOB_PLANNERS: Role[] = [Role.OWNER, Role.MANAGER];

/** Start and stop machines, reverse production entries. */
export const FLOOR_LEADS: Role[] = [Role.OWNER, Role.MANAGER, Role.SUPERVISOR];

/** Operators record only their own entries; the others, for any operator. */
export const ENTRY_RECORDERS: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.SUPERVISOR,
  Role.OPERATOR,
];

/** Issue material, receive finished goods, take material back. */
export const STORE_STAFF: Role[] = [Role.OWNER, Role.MANAGER, Role.STOREKEEPER];

export const PRODUCTION_READERS: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.SUPERVISOR,
  Role.STOREKEEPER,
];
