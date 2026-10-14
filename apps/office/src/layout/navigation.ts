import {
  Boxes,
  ClipboardList,
  Database,
  Factory,
  type LucideIcon,
  Recycle,
  Truck,
  Users,
} from 'lucide-react';
import type { Role } from '@/api/types';
import { text } from '@/i18n';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

const OFFICE_STAFF: Role[] = ['OWNER', 'MANAGER', 'SUPERVISOR', 'STOREKEEPER'];

// Each area with the roles the API lets read it, so the menu only offers
// what works. Operators read job cards to pick one; everything else they
// do is on the tablet.
export const NAVIGATION: NavItem[] = [
  { path: '/stock', label: text.nav.stock, icon: Boxes, roles: OFFICE_STAFF },
  {
    path: '/production',
    label: text.nav.production,
    icon: Factory,
    roles: [...OFFICE_STAFF, 'OPERATOR'],
  },
  {
    path: '/orders',
    label: text.nav.orders,
    icon: ClipboardList,
    roles: OFFICE_STAFF,
  },
  {
    path: '/dispatch',
    label: text.nav.dispatch,
    icon: Truck,
    roles: OFFICE_STAFF,
  },
  { path: '/scrap', label: text.nav.scrap, icon: Recycle, roles: OFFICE_STAFF },
  {
    path: '/master-data',
    label: text.nav.masterData,
    icon: Database,
    roles: OFFICE_STAFF,
  },
  { path: '/users', label: text.nav.users, icon: Users, roles: ['OWNER'] },
];

export function menuFor(role: Role): NavItem[] {
  return NAVIGATION.filter((item) => item.roles.includes(role));
}
