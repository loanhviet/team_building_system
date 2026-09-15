"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Returning a value here makes the column header clickable to sort by it
   * (client-side, over whatever `rows` this render got — for a server-paginated
   * list that's the current page only, which is still useful). Omit for
   * columns that shouldn't be sortable (actions, free text, etc). */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
};

/**
 * The shared list component every admin screen should use — BRD §10 requires
 * search/filter/sort/export on every list, and before this existed, 9 of 11
 * admin lists had none of it because each screen hand-rolled its own table.
 *
 * Search and filter stay owned by the caller (via `toolbar`, plus whatever
 * query params drive `rows`) since several screens filter server-side and
 * that state has to stay in sync with the Export request. Sort and (optional)
 * pagination are handled here since they're pure presentation.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  emptyMessage = "Chưa có dữ liệu",
  toolbar,
  onRowClick,
  pageSize,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  toolbar?: ReactNode;
  onRowClick?: (row: T) => void;
  /** When set, paginates `rows` client-side at this size. Omit when the
   * caller already paginates server-side (e.g. offset/limit query params). */
  pageSize?: number;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const withValue = rows.map((row) => ({ row, value: col.sortValue!(row) }));
    withValue.sort((a, b) => {
      if (a.value == null && b.value == null) return 0;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      if (a.value < b.value) return sort.dir === "asc" ? -1 : 1;
      if (a.value > b.value) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return withValue.map((x) => x.row);
  }, [rows, sort, columns]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const paged = pageSize ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={c.className}
                  aria-sort={
                    sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="flex min-h-8 items-center gap-1 hover:text-foreground"
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  Đang tải...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              paged.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/70" : "hover:bg-muted/50"}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className} onClick={c.key === "actions" ? (e) => e.stopPropagation() : undefined}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {pageSize && sorted.length > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Trang {page + 1} / {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

