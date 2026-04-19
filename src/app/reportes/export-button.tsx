"use client";

import { Button } from "@/components/ui/button";
import { downloadCsv, toCsv } from "@/lib/csv";

export function ExportCsvButton<T extends Record<string, unknown>>({
  filename,
  rows,
  columns,
}: {
  filename: string;
  rows: T[];
  columns: { key: keyof T; header: string }[];
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, toCsv(rows, columns))}
    >
      Exportar CSV
    </Button>
  );
}
