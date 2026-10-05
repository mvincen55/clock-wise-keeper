export const SHEET_LAYOUT = {
  width: 998, height: 754, left: 20, tableTop: 154, tableWidth: 958, headerHeight: 60, rowHeight: 38,
  columns: [25, 43, 47, 100, 85, 57, 150, 36, 60, 88, 88, 70],
};
export const SHEET_HEADERS = ['#', 'Date', 'Time\nAM / PM', 'Credit to\nteam member', 'Booked by\noptional', 'Booked\nbefore\nleaving', 'Actual prepayment\nnot card on file', 'Staff\ninit.', 'App code\nif any', 'Handoff\nverified', 'Prepayment\nverified', 'Date\nverified'];
export function cellBounds(row: number, column: number) {
  const l = SHEET_LAYOUT; const sum = l.columns.reduce((a, b) => a + b, 0);
  const innerWidth = l.tableWidth - 2; // separate outer border, one pixel per side
  const x = l.left + 1 + l.columns.slice(0, column).reduce((a, b) => a + b, 0) / sum * innerWidth;
  return { x, y: l.tableTop + 1 + l.headerHeight + (row - 1) * l.rowHeight, width: l.columns[column] / sum * innerWidth, height: l.rowHeight };
}
