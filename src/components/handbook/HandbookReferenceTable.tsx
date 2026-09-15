import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useOfficeFeeLookup } from '@/hooks/useOfficeFeeLookup';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  codeColumnIndex,
  codesInCell,
  feeColumnIndex,
  isFeeTable,
  liveFeeLabel,
  printedFeeMatches,
} from '@/lib/handbook-fees';

interface Props {
  rows: string[][];
  /** False when the source had no header row: every row is data. */
  hasHeader?: boolean;
  renderText?: (text: string) => ReactNode;
  id?: string;
  className?: string;
}

/**
 * Reference table shared by the uploaded-document and published-policy
 * readers. When a table quotes fees by procedure code, each fee cell shows
 * the current office fee schedule figure so the handbook never drifts from
 * the schedule; the printed figure stays visible only where it differs.
 */
export default function HandbookReferenceTable({ rows, hasHeader = true, renderText = text => text, id, className = '' }: Props) {
  const feeTable = hasHeader && isFeeTable(rows);
  const { data: lookup } = useOfficeFeeLookup(feeTable);
  const { data: ctx } = useOrgContext();
  const header = rows[0] ?? [];
  const body = hasHeader ? rows.slice(1) : rows;
  const feeColumn = feeTable ? feeColumnIndex(header) : -1;
  const codeColumn = feeTable ? codeColumnIndex(header) : -1;
  const byCode = feeTable ? lookup?.byCode : undefined;
  let liveCells = 0;

  const cell = (row: string[], column: number): ReactNode => {
    const printed = row[column] ?? '';
    if (!byCode || column !== feeColumn) return renderText(printed);
    const live = liveFeeLabel(codesInCell(row[codeColumn] ?? ''), byCode);
    if (!live) return renderText(printed);
    liveCells++;
    return (
      <>
        <span className="handbook-live-fee">{live}</span>
        {printed && !printedFeeMatches(printed, live) && (
          <span className="handbook-printed-fee">Handbook: {renderText(printed)}</span>
        )}
      </>
    );
  };

  const bodyRows = body.map((row, rowIndex) => (
    <tr key={rowIndex}>
      {row.map((_, column) =>
        column === 0 && hasHeader ? (
          <th scope="row" key={column}>{cell(row, column)}</th>
        ) : (
          <td key={column}>{cell(row, column)}</td>
        )
      )}
    </tr>
  ));
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  return (
    <>
      <div id={id} className={`${className} handbook-table-wrap`} role="region" aria-label="Reference table" tabIndex={0}>
        <table className="handbook-reference-table">
          {hasHeader && (
            <thead>
              <tr>{header.map((text, column) => <th scope="col" key={column}>{renderText(text)}</th>)}</tr>
            </thead>
          )}
          <tbody>{bodyRows}</tbody>
        </table>
      </div>
      {lookup && liveCells > 0 && (
        <p className="handbook-table-note">
          Fees come from the office fee schedule ({lookup.scheduleName}) and update whenever it changes. Where the handbook printed a different figure, that figure stays visible for reference.
          {isManager && <> <Link to="/fof/fees">Open the fee schedule</Link></>}
        </p>
      )}
    </>
  );
}
