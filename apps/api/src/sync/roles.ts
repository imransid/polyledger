import { Role } from '../generated/prisma/client.js';

/** Register, re-pair and revoke tablets. */
export const DEVICE_ADMINS: Role[] = [Role.OWNER];

/** Review the records the server refused. */
export const RECORD_REVIEWERS: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.SUPERVISOR,
];

/** Sign in on a tablet and record shifts and waste there. */
export const TABLET_RECORDERS: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.SUPERVISOR,
  Role.OPERATOR,
];
