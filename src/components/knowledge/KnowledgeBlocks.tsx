import { CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { KnowledgeBlockRow } from '@/integrations/supabase/knowledge-client';

type Props = {
  blocks: KnowledgeBlockRow[];
};

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function tableRows(text: string): string[][] {
  return lines(text).map(line =>
    line
      .split('|')
      .map(cell => cell.trim())
      .filter((cell, index, cells) => cell || (index > 0 && index < cells.length - 1)),
  );
}

function KnowledgeBlock({ block }: { block: KnowledgeBlockRow }) {
  const contentLines = lines(block.plain_text);

  if (block.block_type === 'divider') return <hr className="my-7 border-border" />;
  if (block.block_type === 'heading') {
    return <h2 className="mt-8 scroll-mt-24 text-xl font-semibold tracking-tight first:mt-0">{block.plain_text}</h2>;
  }
  if (block.block_type === 'bullet_list') {
    return (
      <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-7 text-foreground/90">
        {contentLines.map((line, index) => <li key={`${block.id}-${index}`}>{line.replace(/^[-•]\s*/, '')}</li>)}
      </ul>
    );
  }
  if (block.block_type === 'numbered_list' || block.block_type === 'steps') {
    return (
      <ol className="my-4 space-y-3 pl-0 text-[15px] leading-7 text-foreground/90 [counter-reset:step]">
        {contentLines.map((line, index) => (
          <li key={`${block.id}-${index}`} className="flex gap-3 [counter-increment:step]">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary before:content-[counter(step)]" />
            <span>{line.replace(/^\d+[.)]\s*/, '')}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (block.block_type === 'checklist') {
    return (
      <div className="my-4 space-y-2">
        {contentLines.map((line, index) => (
          <div key={`${block.id}-${index}`} className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{line.replace(/^[-•☐✓]\s*/, '')}</span>
          </div>
        ))}
      </div>
    );
  }
  if (block.block_type === 'callout') {
    return (
      <Alert className="my-5 border-primary/25 bg-primary/5">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle>Important</AlertTitle>
        <AlertDescription className="whitespace-pre-wrap leading-6">{block.plain_text}</AlertDescription>
      </Alert>
    );
  }
  if (block.block_type === 'script') {
    return (
      <div className="my-5 rounded-xl border-l-4 border-primary bg-muted/35 px-5 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">Suggested wording</p>
        <p className="whitespace-pre-wrap text-[15px] italic leading-7 text-foreground/90">“{block.plain_text}”</p>
      </div>
    );
  }
  if (block.block_type === 'table') {
    const rows = tableRows(block.plain_text);
    const [head, ...body] = rows;
    if (!head) return null;
    return (
      <div className="my-5 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[480px] border-collapse text-left text-sm">
          <thead className="bg-muted/60">
            <tr>{head.map((cell, index) => <th key={index} className="border-b px-3 py-2.5 font-semibold">{cell}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b last:border-0">
                {head.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2.5 align-top">{row[cellIndex] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.block_type === 'image') {
    return (
      <div className="my-5 flex items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        <FileText className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="whitespace-pre-wrap leading-6">{block.plain_text}</p>
      </div>
    );
  }

  return <p className="my-4 whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">{block.plain_text}</p>;
}

export default function KnowledgeBlocks({ blocks }: Props) {
  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">This published version has no readable content blocks.</p>;
  }
  return <>{blocks.map(block => <KnowledgeBlock key={block.id} block={block} />)}</>;
}
