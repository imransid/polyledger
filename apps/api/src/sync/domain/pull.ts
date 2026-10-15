/** One table's part of a WatermelonDB pull. */
export interface TableChanges<T> {
  created: T[];
  updated: T[];
  deleted: string[];
}

// Rows still on the tablet's list come as created on the first pull and as
// updated after; changed rows that left the list (a closed job card, a
// retired machine) come as deleted.
export function changesOf<Row extends { id: string }, Record>(
  rows: Row[],
  firstPull: boolean,
  onTablet: (row: Row) => boolean,
  toRecord: (row: Row) => Record,
): TableChanges<Record> {
  const kept = rows.filter(onTablet).map(toRecord);
  return {
    created: firstPull ? kept : [],
    updated: firstPull ? [] : kept,
    deleted: firstPull
      ? []
      : rows.filter((row) => !onTablet(row)).map((row) => row.id),
  };
}
