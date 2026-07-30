import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, CheckCircle2, Lightbulb, MessagesSquare, RotateCcw, Target, XCircle } from 'lucide-react';
import {
  PASS_MARK,
  useMyRoleplayAttempts,
  useRecordAttempt,
  useUpdateAssignmentStatus,
  type TrainingAssignment,
  type TrainingModule,
} from '@/hooks/useTraining';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSpeech } from '@/hooks/useSpeech';
import ReadAloudControls from './ReadAloudControls';
import RoleplayChat from './RoleplayChat';
import RoleplayRubricCard from './RoleplayRubricCard';
import ModuleAuditPanel from './ModuleAuditPanel';
import { useOrgContext } from '@/hooks/useOrgContext';



type Props = {
  module: TrainingModule;
  assignment?: TrainingAssignment;
  onBack: () => void;
};

/**
 * The reading experience: outcome up front, one section at a time with a
 * "try it today" action, a recap, then the scenario quiz. 80% passes and
 * retakes are unlimited — the point is learning it, not scoring it.
 */
export default function ModulePlayer({ module, assignment, onBack }: Props) {
  const content = module.content;
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  const questions = content.quiz?.questions ?? [];
  const [phase, setPhase] = useState<'read' | 'quiz' | 'result' | 'roleplay'>('read');
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [graded, setGraded] = useState(false);

  const recordAttempt = useRecordAttempt();
  const updateStatus = useUpdateAssignmentStatus();
  const { data: roleplayAttempts } = useMyRoleplayAttempts(module.id);
  const lastRoleplay = roleplayAttempts?.[0]?.result ?? null;


  // Read-aloud chunks: title/outcome, each section, then the recap.
  const speechChunks = useMemo(() => {
    const parts: string[] = [];
    parts.push([module.title, content.outcome && `What you'll be able to do: ${content.outcome}`]
      .filter(Boolean)
      .join('. '));
    content.sections.forEach(section => {
      parts.push(
        [section.heading, section.body, section.try_it && `Try it today: ${section.try_it}`]
          .filter(Boolean)
          .join('. ')
      );
    });
    if (content.recap) parts.push(`Recap. ${content.recap}`);
    return parts;
  }, [module.title, content]);

  const speech = useSpeech(speechChunks);

  // Section index 0 is the intro block, so sections start at 1.
  const activeSection = speech.activeIndex === null ? null : speech.activeIndex - 1;



  const score = useMemo(() => {
    if (questions.length === 0) return 100;
    const right = questions.filter((q, i) => answers[i] === q.correct_index).length;
    return Math.round((right / questions.length) * 100);
  }, [answers, questions]);

  const passed = score >= PASS_MARK;
  const allAnswered = questions.every((_, i) => answers[i] !== undefined);

  async function complete() {
    if (assignment && assignment.status !== 'completed') {
      await updateStatus.mutateAsync({ id: assignment.id, status: 'completed' });
    }
  }

  async function finishReading() {
    speech.stop();
    if (questions.length > 0) {

      if (assignment && assignment.status === 'assigned') {
        updateStatus.mutate({ id: assignment.id, status: 'in_progress' });
      }
      setPhase('quiz');
      return;
    }
    await complete();
    toast.success('Module complete — nice work.');
    onBack();
  }

  async function submitQuiz() {
    setGraded(true);
    setPhase('result');
    await recordAttempt.mutateAsync({
      moduleId: module.id,
      score,
      passed,
      answers: questions.map((_, i) => answers[i] ?? -1),
    });
    if (passed) {
      await complete();
      toast.success(`Passed with ${score}%.`);
    }
  }

  function retake() {
    setAnswers({});
    setGraded(false);
    setPhase('quiz');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => { speech.stop(); onBack(); }} className="-ml-2">
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Training
      </Button>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={module.source === 'pathfinder' ? 'default' : 'secondary'}>
            {module.source === 'pathfinder' ? 'Built by Pathfinder' : 'By the team'}
          </Badge>
          {module.audience_tags.map(tag => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
        <h1 className="text-2xl font-semibold leading-tight">{module.title}</h1>
        {module.summary && <p className="text-muted-foreground">{module.summary}</p>}
      </div>

      {isAdmin && module.audit && <ModuleAuditPanel audit={module.audit} />}

      {phase === 'read' && (
        <div className="space-y-6">
          <ReadAloudControls speech={speech} />

          {content.outcome && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="flex gap-3 p-4">
                <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">What you'll be able to do</p>
                  <p className="text-sm text-muted-foreground">{content.outcome}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {content.sections.map((section, i) => (
            <section
              key={i}
              className={cn(
                'space-y-3 rounded-md transition-colors',
                activeSection === i && 'bg-primary/5 ring-1 ring-primary/30 p-3 -m-0.5'
              )}
            >

              <h2 className="text-lg font-semibold">{section.heading}</h2>
              {section.body.split(/\n{2,}/).map((para, j) => (
                <p key={j} className="text-sm leading-relaxed text-foreground/90">
                  {para}
                </p>
              ))}
              {section.try_it && (
                <div className="flex gap-2.5 rounded-md border border-border bg-muted/40 p-3">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="text-sm">
                    <span className="font-medium">Try it today: </span>
                    <span className="text-muted-foreground">{section.try_it}</span>
                  </div>
                </div>
              )}
            </section>
          ))}

          {content.recap && (
            <>
              <Separator />
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">Recap</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{content.recap}</p>
              </section>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={finishReading}>
              {questions.length > 0 ? 'Start the quiz' : 'Mark as complete'}
            </Button>
            <Button variant="outline" onClick={() => { speech.stop(); setPhase('roleplay'); }}>
              <MessagesSquare className="mr-1.5 h-4 w-4" />
              Practice the conversation
            </Button>
          </div>

        </div>
      )}

      {(phase === 'quiz' || phase === 'result') && (
        <div className="space-y-5">
          {phase === 'result' && (
            <Card className={cn(passed ? 'border-primary/50 bg-primary/5' : 'border-warning/50')}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {passed ? `Passed — ${score}%` : `${score}% — not quite yet`}
                  </p>
                  <span className="text-xs text-muted-foreground">{PASS_MARK}% to pass</span>
                </div>
                <Progress value={score} />
                <p className="text-sm text-muted-foreground">
                  {passed
                    ? 'This one is marked complete. Read the explanations below anytime.'
                    : 'Read the explanations below, then take it again — as many times as you like.'}
                </p>
              </CardContent>
            </Card>
          )}

          {questions.map((question, qi) => {
            const chosen = answers[qi];
            return (
              <Card key={qi}>
                <CardContent className="space-y-3 p-4">
                  <p className="text-sm font-medium">
                    {qi + 1}. {question.q}
                  </p>
                  <div className="space-y-2">
                    {question.options.map((option, oi) => {
                      const isChosen = chosen === oi;
                      const isCorrect = oi === question.correct_index;
                      return (
                        <button
                          key={oi}
                          type="button"
                          disabled={graded}
                          onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}
                          className={cn(
                            'flex w-full items-start gap-2 rounded-md border p-2.5 text-left text-sm transition-colors',
                            !graded && 'hover:bg-muted',
                            isChosen && !graded && 'border-primary bg-primary/5',
                            graded && isCorrect && 'border-primary bg-primary/10',
                            graded && isChosen && !isCorrect && 'border-destructive bg-destructive/10'
                          )}
                        >
                          {graded && isCorrect && (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          )}
                          {graded && isChosen && !isCorrect && (
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          )}
                          <span>{option}</span>
                        </button>
                      );
                    })}
                  </div>
                  {graded && (
                    <p className="rounded-md bg-muted/50 p-2.5 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Why: </span>
                      {question.why}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {phase === 'quiz' && (
            <Button onClick={submitQuiz} disabled={!allAnswered || recordAttempt.isPending}>
              Submit answers
            </Button>
          )}
          {phase === 'result' && (
            <div className="flex flex-wrap gap-2">
              <Button variant={passed ? 'outline' : 'default'} onClick={retake}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Take it again
              </Button>
              <Button variant="outline" onClick={() => { speech.stop(); setPhase('roleplay'); }}>
                <MessagesSquare className="mr-1.5 h-4 w-4" />
                Practice the conversation
              </Button>
              <Button variant="ghost" onClick={() => setPhase('read')}>
                Reread the module
              </Button>
              <Button variant="ghost" onClick={onBack}>
                Done
              </Button>
            </div>
          )}
        </div>
      )}

      {phase === 'roleplay' && (
        <div className="space-y-5">
          <RoleplayChat module={module} />

          {lastRoleplay && (
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Your last breakdown — {lastRoleplay.score}%
              </summary>
              <div className="pt-4">
                <RoleplayRubricCard result={lastRoleplay} />
              </div>
            </details>
          )}

          <Button variant="ghost" onClick={() => setPhase(questions.length ? 'result' : 'read')}>
            Back to the module
          </Button>
        </div>
      )}
    </div>
  );

}
