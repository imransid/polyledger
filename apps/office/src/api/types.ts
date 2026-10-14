import type { paths } from './schema';

export type CurrentUser =
  paths['/auth/me']['get']['responses'][200]['content']['application/json'];

export type Role = CurrentUser['role'];
