import { clickDownload } from './download';

export type Cell = string | number | Date;

export type Table = {
  filename: string;
  sheet: string;
  headers: string[];
  rows: Cell[][];
};

function csvCell(value: Cell): string {
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(table: Table) {
  const lines = [table.headers, ...table.rows].map((row) => row.map(csvCell).join(','));
  const blob = new Blob([`﻿${lines.join('\r\n')}\r\n`], {
    type: 'text/csv;charset=utf-8',
  });
  const href = URL.createObjectURL(blob);
  clickDownload(href, `${table.filename}.csv`);
  URL.revokeObjectURL(href);
}

function sheetName(name: string) {
  return name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1';
}

export async function downloadXlsx(table: Table) {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows], {
    cellDates: true,
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName(table.sheet));
  XLSX.writeFile(book, `${table.filename}.xlsx`, { compression: true });
}
