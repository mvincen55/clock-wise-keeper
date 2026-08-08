import { AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatCents } from '@/lib/account-balance/money';
import { answerResolves } from '@/lib/account-balance/questions';
import type { AnswerMap, SmartQuestion } from '@/lib/account-balance/types';

/**
 * Stage 3 — SMART REVIEW. Renders the question engine's output: the minimum
 * set of questions whose answers materially change the patient explanation.
 * Answers live only in the in-memory session; "I need to investigate" keeps
 * a required question unresolved on purpose.
 */

interface SmartReviewPanelProps {
  questions: SmartQuestion[];
  answers: AnswerMap;
  onAnswer: (questionId: string, optionId: string, note?: string) => void;
  onClearAnswer: (questionId: string) => void;
}

/** Options whose answers need a describing note before they resolve. */
const NOTE_OPTIONS = new Set(['other', 'fee', 'credit', 'patient_charge', 'patient_credit']);

export default function SmartReviewPanel({
  questions,
  answers,
  onAnswer,
  onClearAnswer,
}: SmartReviewPanelProps) {
  if (questions.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-600/5 p-4 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
        Nothing needs staff context — the ledger explains itself.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map(question => {
        const answer = answers[question.id];
        const resolved = answerResolves(answers, question.id);
        const blocking = question.options.length === 0;
        return (
          <div
            key={question.id}
            className={`rounded-md border p-4 ${
              blocking
                ? 'border-destructive/50 bg-destructive/5'
                : resolved
                  ? 'border-emerald-600/30 bg-emerald-600/5'
                  : ''
            }`}
          >
            <div className="flex items-start gap-2">
              {blocking ? (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              ) : resolved ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-700" />
              ) : (
                <CircleHelp className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              )}
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium">{question.prompt}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {question.required ? (
                    <Badge variant={resolved || blocking ? 'secondary' : 'destructive'} className="text-[10px]">
                      Required before printing
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Improves the wording</Badge>
                  )}
                </div>
                {question.options.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {question.options.map(option => (
                      <Button
                        key={option.id}
                        size="sm"
                        variant={answer?.optionId === option.id ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() =>
                          answer?.optionId === option.id
                            ? onClearAnswer(question.id)
                            : onAnswer(question.id, option.id, answer?.note)
                        }
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                )}
                {answer && NOTE_OPTIONS.has(answer.optionId) && (
                  <div className="space-y-1">
                    <Textarea
                      className="min-h-[60px] text-sm"
                      placeholder="Describe it exactly as it should appear to the patient…"
                      value={answer.note ?? ''}
                      onChange={e => onAnswer(question.id, answer.optionId, e.target.value)}
                    />
                    {!(answer.note ?? '').trim() && (
                      <p className="text-xs text-destructive">
                        Add the wording — the answer counts once it's described.
                      </p>
                    )}
                  </div>
                )}
                {answer?.optionId === 'investigate' && (
                  <p className="text-xs text-muted-foreground">
                    Marked for investigation — this stays unresolved until a real answer is chosen.
                  </p>
                )}
              </div>
              {question.amountCents !== undefined && question.amountCents !== 0 && (
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatCents(question.amountCents)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
