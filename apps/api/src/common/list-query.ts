import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';

export const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const activeFilter = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export type ListQuery = z.infer<typeof listQuery>;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageArgs({ page, pageSize }: ListQuery) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function codeOrNameContains(search: string | undefined) {
  if (!search) {
    return {};
  }
  return {
    OR: [
      { code: { contains: search, mode: 'insensitive' as const } },
      { name: { contains: search, mode: 'insensitive' as const } },
    ],
  };
}

export function found<T>(record: T | null | undefined, label: string): T {
  if (!record) {
    throw new NotFoundException(`${label} not found`);
  }
  return record;
}
