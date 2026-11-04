import React, { useMemo, useState } from 'react';
import {
  flexRender,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  useTable,
  tableFeatures,
  columnFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  filterFn_includesString,
  sortFn_text,
  type Cell,
  type ColumnDef as TableColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table';
import type { RecordItem } from '../../sdk/types';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { useAction } from '../../sdk/hooks';

const features = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { text: sortFn_text },
});

export interface ColumnDef<T> {
  key: string;
  header: string;
  width?: string;
  editable?: boolean;
  render?: (record: RecordItem<T>, isEditing: boolean) => React.ReactNode;
}
export interface DataTableProps<T = Record<string, unknown>> {
  records: RecordItem<T>[];
  columns: ColumnDef<T>[];
  onUpdateRecord?: (id: string, updatedPayload: Partial<T>) => Promise<void>;
  pageSize?: number;
}
export function DataTable<T extends Record<string, unknown>>({
  records,
  columns,
  onUpdateRecord,
  pageSize = 10,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filters, setFilters] = useState<ColumnFiltersState>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const action = useAction();
  const definitions = useMemo<TableColumnDef<typeof features, RecordItem<T>>[]>(
    () =>
      columns.map((col) => ({
        id: col.key,
        header: col.header,
        filterFn: 'includesString',
        accessorFn: (record) =>
          record.payload[col.key] ?? (record as unknown as Record<string, unknown>)[col.key] ?? '',
        cell: ({ row }) =>
          col.render
            ? col.render(row.original, false)
            : String(row.original.payload[col.key] ?? ''),
      })),
    [columns],
  );
  const renderCell = (cell: Cell<typeof features, RecordItem<T>>) => {
    const column = columns.find((item) => item.key === cell.column.id);
    return editingId === cell.row.id && column?.editable ? (
      <Input
        aria-label={column.header}
        type={column.key.endsWith('Date') ? 'date' : 'text'}
        value={String(editValues[column.key] ?? cell.row.original.payload[column.key] ?? '')}
        onChange={(event) => setEditValues((old) => ({ ...old, [column.key]: event.target.value }))}
      />
    ) : (
      flexRender(cell.column.columnDef.cell, cell.getContext())
    );
  };
  const table = useTable({
    features,
    data: records,
    columns: definitions,
    state: { sorting, columnFilters: filters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setFilters,
    getRowId: (record) => record.id,
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });
  const actions = (record: RecordItem<T>) =>
    onUpdateRecord &&
    (editingId === record.id ? (
      <>
        <Button
          size="sm"
          disabled={action.pending}
          onClick={() =>
            void action.run(async () => {
              await onUpdateRecord(record.id, editValues as Partial<T>);
              setEditingId(null);
            })
          }
        >
          保存
        </Button>
        <Button size="sm" onClick={() => setEditingId(null)}>
          取消
        </Button>
      </>
    ) : (
      <Button
        size="sm"
        onClick={() => {
          setEditingId(record.id);
          setEditValues({});
        }}
      >
        编辑
      </Button>
    ));
  const rows = table.getRowModel().rows;
  return (
    <div className="data-table module-container">
      {action.error && <p role="alert">{action.error}</p>}
      <div className="table-filters">
        {columns
          .filter((col) => col.editable)
          .map((col) => (
            <Input
              key={col.key}
              aria-label={'筛选' + col.header}
              placeholder={'筛选' + col.header}
              value={String(table.getColumn(col.key)?.getFilterValue() ?? '')}
              onChange={(event) => table.getColumn(col.key)?.setFilterValue(event.target.value)}
            />
          ))}
      </div>
      <div className="table-desktop visible-scrollbar">
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
                    <button onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc'
                        ? ' ▲'
                        : header.column.getIsSorted() === 'desc'
                          ? ' ▼'
                          : ''}
                    </button>
                  </th>
                ))}
                {onUpdateRecord && <th>操作</th>}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>{renderCell(cell)}</td>
                ))}
                {onUpdateRecord && <td>{actions(row.original)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-compact">
        {rows.map((row) => (
          <article key={row.id}>
            {row.getAllCells().map((cell) => (
              <div key={cell.id}>
                <label>{columns.find((col) => col.key === cell.column.id)?.header}</label>
                {renderCell(cell)}
              </div>
            ))}
            <div>{actions(row.original)}</div>
          </article>
        ))}
      </div>
      {rows.length === 0 && <p>暂无匹配数据</p>}
      <div className="table-pagination">
        <span>共 {table.getFilteredRowModel().rows.length} 条记录</span>
        <Button
          size="sm"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          上一页
        </Button>
        <span>
          {table.state.pagination.pageIndex + 1}/{Math.max(1, table.getPageCount())}
        </span>
        <Button size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
          下一页
        </Button>
      </div>
    </div>
  );
}
