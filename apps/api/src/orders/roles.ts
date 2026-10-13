import { Role } from '../generated/prisma/client.js';

export const SALES_EDITORS: Role[] = [Role.OWNER, Role.MANAGER];

export const SALES_READERS: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.SUPERVISOR,
  Role.STOREKEEPER,
];
