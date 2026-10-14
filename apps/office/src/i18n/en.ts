import type { Role } from '@/api/types';

export const en = {
  appName: 'Polyledger',
  loading: 'Loading…',
  required: 'Required',
  errors: {
    unexpected: 'Something went wrong. Try again.',
    offline: 'Cannot reach the server. Check the connection and try again.',
    tooManyAttempts: 'Too many attempts. Wait a minute and try again.',
    noAccess: 'Your role cannot use this page.',
    notFound: 'This page does not exist.',
  },
  login: {
    title: 'Log in',
    login: 'Phone or email',
    password: 'Password',
    submit: 'Log in',
  },
  session: {
    logOut: 'Log out',
    changePassword: 'Change password',
  },
  password: {
    title: 'Change password',
    current: 'Current password',
    new: 'New password',
    repeat: 'Repeat new password',
    submit: 'Change password',
    tooShort: 'At least 8 characters',
    tooLong: 'At most 128 characters',
    mismatch: 'The new passwords do not match',
    changed: 'Password changed. Your other devices have been logged out.',
  },
  nav: {
    home: 'Home',
    stock: 'Stock',
    production: 'Production',
    orders: 'Sales orders',
    dispatch: 'Dispatch',
    scrap: 'Scrap',
    masterData: 'Master data',
    users: 'Users',
  },
  home: {
    welcome: (name: string) => `Welcome, ${name}`,
    intro: 'Choose an area from the menu.',
  },
  notBuiltYet: 'This screen is not built yet.',
  roles: {
    OWNER: 'Owner',
    MANAGER: 'Manager',
    STOREKEEPER: 'Storekeeper',
    SUPERVISOR: 'Supervisor',
    OPERATOR: 'Operator',
  } satisfies Record<Role, string>,
};

/** The shape a Bangla dictionary will have to match. */
export type Messages = typeof en;
