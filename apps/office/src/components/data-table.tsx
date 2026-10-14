import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Column } from './list-options';

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  /** Extra classes for a row that needs attention, such as a late order. */
  rowClass?: (row: T) => string | undefined;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowClass,
}: DataTableProps<T>) {
  const align = (column: Column<T>) =>
    column.numeric ? 'text-right tabular-nums' : undefined;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.header} className={align(column)}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={rowKey(row)} className={rowClass?.(row)}>
            {columns.map((column) => (
              <TableCell key={column.header} className={cn(align(column))}>
                {column.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
