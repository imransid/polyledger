import type { ReactNode } from 'react';
import type { EquipmentStatus } from '@/api/types';
import { text } from '@/i18n';

export interface ListQuery {
  search?: string;
  page: number;
  pageSize: number;
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-aligned, so figures line up. */
  numeric?: boolean;
}

export interface Filter {
  options: { value: string; label: string }[];
  initial: string;
}

export const ACTIVE_FILTER: Filter = {
  options: [
    { value: 'true', label: text.list.activeOnly },
    { value: 'false', label: text.list.inactiveOnly },
    { value: '', label: text.list.all },
  ],
  initial: 'true',
};

export function activeParam(value: string): 'true' | 'false' | undefined {
  return value === 'true' || value === 'false' ? value : undefined;
}

export const EQUIPMENT_STATUSES: EquipmentStatus[] = [
  'ACTIVE',
  'REPAIR',
  'RETIRED',
];

export const STATUS_FILTER: Filter = {
  options: [
    { value: '', label: text.list.allStatuses },
    ...EQUIPMENT_STATUSES.map((status) => ({
      value: status,
      label: text.masterData.statuses[status],
    })),
  ],
  initial: '',
};

export function statusParam(value: string): EquipmentStatus | undefined {
  return EQUIPMENT_STATUSES.find((status) => status === value);
}
