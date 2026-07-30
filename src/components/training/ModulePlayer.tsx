import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  CheckCircle2,
  Lightbulb,
  MessagesSquare,
  Pause,
  Play,
  RotateCcw,
  Square,
  Target,
  Volume2,
  XCircle,
} from 'lucide-react';
import {
  PASS_MARK,
  useRecordAttempt,
  useUpdateAssignmentStatus,
  type TrainingAssignment,
  type TrainingModule,
} from '@/hooks/useTraining';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSpeech, type SpeechSegment } from '@/hooks/useSpeech';
import RoleplayChat from './RoleplayChat';

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
  const questions = content.quiz?.questions ?? [];
  const roleplay = content.roleplay;
  const [phase, setPhase] = useState<'read' | 'quiz' | 'result' | 'roleplay'>('read');
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [graded, setGraded] = useState(false);

  const recordAttempt = useRecordAttempt();
  const updateStatus = useUpdateAssignmentStatus();

  // Read-aloud: outcome, then each section with its try-it, then the recap.
  const segments = useMemo<SpeechSegment[]>(() => {
    const list: SpeechSegment[] = [];
    if (content.outcome) list.push({ id: 'outcome', text: `What you'll be able to do. ${content.outcome}` });
    content.sections.forEach((section, i) => {
      const tryIt = section.try_it ? ` Try it today. ${section.try_it}` : '';
      list.push({ id: `section-${i}`, text: `${section.heading}. ${section.body}${tryIt}` });
    });
    if (content.recap) list.push({ id: 'recap', text: `Recap. ${content.recap}` });
    return list;
  }, [content]);

  const speech = useSpeech(segments);

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

  function startAssessment(next: 'quiz' | 'roleplay') {
    speech.stop();
    if (assignment && assignment.status === 'assigned') {
      updateStatus.mutate({ id: assignment.id, status: 'in_progress' });
    }
    setPhase(next);
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
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
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
        {phase === 'read' && speech.supported && segments.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={speech.toggle}>
              {!speech.speaking ? (
                <Volume2 className="mr-1.5 h-4 w-4" />
              ) : speech.paused ? (
                <Play className="mr-1.5 h-4 w-4" />
              ) : (
                <Pause className="mr-1.5 h-4 w-4" />
              )}
              {!speech.speaking ? 'Listen' : speech.paused ? 'Resume' : 'Pause'}
            </Button>
            {speech.speaking && (
              <Button variant="ghost" size="sm" onClick={speech.stop}>
                <Square className="mr-1.5 h-3.5 w-3.5" />
                Stop
              </Button>
            )}
          </div>
        )}
      </div>

      {phase === 'read' && (
        <div className="space-y-6">
          {content.outcome && (
            <Card
              className={cn(
                'border-primary/40 bg-primary/5 transition-shadow',
                speech.activeId === 'outcome' && 'ring-2 ring-primary/50'
              )}
            >
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
                speech.activeId === `section-${i}` && 'bg-primary/5 p-3 ring-1 ring-primary/30'
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
              <section
                className={cn(
                  'space-y-2 rounded-md transition-colors',
                  speech.activeId === 'recap' && 'bg-primary/5 p-3 ring-1 ring-primary/30'
                )}
              >
                <h2 className="text-lg font-semibold">Recap</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{content.recap}</p>
              </section>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            {questions.length > 0 && (
              <Button onClick={() => startAssessment('quiz')}>Take the quiz</Button>
            )}
            {roleplay && (
              <Button
                variant={questions.length > 0 ? 'outline' : 'default'}
                onClick={() => startAssessment('roleplay')}
              >
                <MessagesSquare className="mr-1.5 h-4 w-4" />
                Practise the conversation
              </Button>
            )}
            {questions.length === 0 && !roleplay && (
              <Button onClick={finishReading}>Mark as complete</Button>
            )}
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
              {roleplay && (
                <Button variant="outline" onClick={() => setPhase('roleplay')}>
                  <MessagesSquare className="mr-1.5 h-4 w-4" />
                  Practise the conversation
                </Button>
              )}
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

      {phase === 'roleplay' && roleplay && (
        <RoleplayChat module={module} onPassed={complete} onBack={onBack} />
      )}
    </div>
  );
}
