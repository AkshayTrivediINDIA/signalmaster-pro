import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, Metric } from '../../components/ui/layout';
import { Alert, EmptyState } from '../../components/ui/feedback';
import { SegmentedControl } from '../../components/ui/fields';
import { Equation } from '../../components/common/Equation';
import { TOPICS, type Level, type Topic } from './content';
import { loadProgress, recordAnswer, resetProgress } from '../../services/storage';
import { Icon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/feedback';
import { getModule } from '../../app/registry';
import { Tooltip } from '../../components/ui/layout';

const LEVEL_STYLES: Record<Level, string> = {
  beginner: 'bg-ok/15 text-ok',
  intermediate: 'bg-brand-soft text-brand-ink',
  advanced: 'bg-warn/15 text-warn',
};

export default function Learning() {
  const [topicId, setTopicId] = useState(TOPICS[0].id);
  const [levelFilter, setLevelFilter] = useState<'all' | Level>('all');
  const [progress, setProgress] = useState(() => loadProgress());
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const toast = useToast();
  const navigate = useNavigate();

  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS[0];
  const visibleTopics = levelFilter === 'all' ? TOPICS : TOPICS.filter((t) => t.level === levelFilter);

  const totals = useMemo(() => {
    const entries = Object.values(progress);
    const attempted = entries.reduce((a, e) => a + e.attempted, 0);
    const correct = entries.reduce((a, e) => a + e.correct, 0);
    const topicsTouched = entries.filter((e) => e.attempted > 0).length;
    return { attempted, correct, topicsTouched, accuracy: attempted ? Math.round((correct / attempted) * 100) : 0 };
  }, [progress]);

  const answerQuestion = (topicIdKey: string, questionId: string, index: number, correctIndex: number) => {
    setAnswers((a) => ({ ...a, [questionId]: index }));
    setProgress(recordAnswer(topicIdKey, index === correctIndex));
  };

  const topicProgress = (t: Topic) => {
    const entry = progress[t.id];
    const answered = Object.keys(answers).filter((qid) => t.questions.some((q) => q.id === qid)).length;
    const total = t.questions.length;
    return { answered, total, pct: total ? Math.round((answered / total) * 100) : 0, accuracy: entry && entry.attempted ? Math.round((entry.correct / entry.attempted) * 100) : null };
  };

  return (
    <div>
      <PageHeader
        title="Learning & Practice"
        description="Original tutorials, verified worked examples and self-marking practice questions. Progress is stored on this device only."
        icon="learning"
        actions={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => navigate('/reference')}>
              <Icon name="book" size={13} /> Formula reference
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                resetProgress();
                setProgress({});
                setAnswers({});
                toast.push('Practice progress reset.');
              }}
            >
              <Icon name="reset" size={13} /> Reset progress
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Topics" value={String(TOPICS.length)} />
        <Metric label="Questions answered" value={String(totals.attempted)} />
        <Metric label="Accuracy" value={totals.attempted ? `${totals.accuracy}%` : '—'} tone={totals.attempted >= 70 ? 'ok' : 'default'} />
        <Metric label="Topics practised" value={`${totals.topicsTouched}/${TOPICS.length}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Card title="Topics" icon="book">
            <SegmentedControl
              label="Difficulty"
              value={levelFilter}
              onChange={setLevelFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'beginner', label: 'Intro' },
                { value: 'intermediate', label: 'Core' },
                { value: 'advanced', label: 'Adv' },
              ]}
            />
            <ul className="mt-2.5 space-y-1">
              {visibleTopics.map((t) => {
                const p = topicProgress(t);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTopicId(t.id)}
                      className={`w-full rounded-[4px] border-l-2 py-1.5 pl-2 pr-1.5 text-left transition-colors ${
                        topicId === t.id
                          ? 'border-l-brand bg-surface2/70 text-ink'
                          : 'border-l-transparent hover:border-l-line-strong hover:bg-surface2/50'
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        <span className="mt-[3px] w-7 shrink-0 font-mono text-[9px] font-semibold uppercase text-muted" style={{ letterSpacing: '0.08em' }}>
                          {t.level.slice(0, 3)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-medium leading-snug text-ink">{t.title}</span>
                          <span className="mt-1 flex items-center gap-1.5">
                            <span className="h-[2px] flex-1 overflow-hidden rounded-full bg-line">
                              <span className="block h-full bg-brand" style={{ width: `${p.pct}%` }} />
                            </span>
                            <span className="font-mono text-[9.5px] tabular-nums text-muted">
                              {p.answered}/{p.total}
                            </span>
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="How to use this" icon="info">
            <ul className="space-y-1.5 text-[11.5px] leading-relaxed text-muted">
              <li>• Read the tutorial, then try the worked examples with the solution hidden.</li>
              <li>• Answer the practice questions; each answer is marked immediately with an explanation.</li>
              <li>• Open the linked module to experiment with the same mathematics.</li>
              <li>• Questions are illustrative practice material, not official exam questions.</li>
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={topic.title} subtitle={topic.summary} icon="learning">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-[3px] border px-1.5 py-[1px] font-mono text-[9.5px] font-semibold uppercase ${LEVEL_STYLES[topic.level]}`} style={{ letterSpacing: '0.06em' }}>
                {topic.level}
              </span>
              {topic.related && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => navigate(getModule(topic.related!.moduleId)?.path ?? '/')}>
                  <Icon name="external" size={12} /> {topic.related.label}
                </button>
              )}
            </div>

            <div className="mt-3 space-y-3">
              {topic.sections.map((s, i) => (
                <section key={i}>
                  <h3 className="text-[13px] font-semibold text-ink">{s.heading}</h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{s.body}</p>
                  {s.latex && (
                    <div className="mt-1.5 overflow-x-auto rounded-lg border border-line bg-surface2/40 px-3 py-2">
                      <Equation latex={s.latex} display />
                    </div>
                  )}
                </section>
              ))}
            </div>
          </Card>

          <Card title="Formula reference for this topic" icon="table">
            <div className="divide-y divide-line">
              {topic.formulas.map((f, i) => (
                <div key={i} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1 overflow-x-auto">
                    <Equation latex={f.latex} />
                  </div>
                  <p className="text-[11.5px] text-muted sm:max-w-[45%] sm:text-right">{f.note}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Worked examples" subtitle="Try each one on paper before revealing the solution" icon="play">
            <div className="space-y-3">
              {topic.worked.map((w) => (
                <div key={w.id} className="rounded-lg border border-line bg-surface2/30 p-3">
                  <p className="text-[13px] font-medium text-ink">{w.prompt}</p>
                  {revealed[w.id] ? (
                    <div className="mt-2 space-y-2">
                      <ol className="space-y-1 text-[12px] leading-relaxed text-muted">
                        {w.steps.map((s, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="font-mono text-[10px] text-brand">{i + 1}.</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="rounded border border-ok/30 bg-ok/10 px-2.5 py-1.5">
                        <p className="text-[12px] font-medium text-ink">{w.answer}</p>
                        {w.answerLatex && <Equation latex={w.answerLatex} />}
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setRevealed((r) => ({ ...r, [w.id]: true }))}>
                      <Icon name="chevronDown" size={12} /> Show solution
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Practice questions"
            subtitle="Answers are marked immediately and explanations are always shown"
            icon="calculator"
            actions={
              <Tooltip text="Clears the recorded answers for this device">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    resetProgress();
                    setProgress({});
                    setAnswers({});
                    toast.push('Progress reset.');
                  }}
                >
                  Reset
                </button>
              </Tooltip>
            }
          >
            {topic.questions.length === 0 ? (
              <EmptyState title="No questions for this topic" />
            ) : (
              <ol className="space-y-3">
                {topic.questions.map((q, qi) => {
                  const chosen = answers[q.id];
                  const answered = chosen !== undefined;
                  return (
                    <li key={q.id} className="rounded-lg border border-line p-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface2 text-[10px] font-semibold text-muted">
                          {qi + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium leading-snug text-ink">{q.prompt}</p>
                          <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${LEVEL_STYLES[q.difficulty]}`}>
                            {q.difficulty}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {q.choices.map((c, ci) => {
                          const isChosen = chosen === ci;
                          const isCorrect = ci === q.answerIndex;
                          const style = !answered
                            ? 'border-line hover:border-brand/50 hover:bg-surface2'
                            : isCorrect
                              ? 'border-ok/60 bg-ok/10'
                              : isChosen
                                ? 'border-err/60 bg-err/10'
                                : 'border-line opacity-70';
                          return (
                            <button
                              key={ci}
                              type="button"
                              disabled={answered}
                              onClick={() => answerQuestion(topic.id, q.id, ci, q.answerIndex)}
                              className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition ${style}`}
                            >
                              <span className="mt-0.5 font-mono text-[10px] text-muted">{String.fromCharCode(65 + ci)}</span>
                              <span className="text-ink">{c}</span>
                              {answered && isCorrect && <Icon name="check" size={13} className="ml-auto mt-0.5 shrink-0 text-ok" />}
                              {answered && isChosen && !isCorrect && <Icon name="close" size={13} className="ml-auto mt-0.5 shrink-0 text-err" />}
                            </button>
                          );
                        })}
                      </div>
                      {answered && (
                        <div className={`mt-2 ${chosen === q.answerIndex ? 'note-ok' : 'note-warn'}`} role="status">
                          <p className="font-semibold">{chosen === q.answerIndex ? 'Correct.' : 'Not quite — the correct answer is highlighted above.'}</p>
                          <p className="mt-0.5 leading-relaxed">{q.explanation}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <Alert tone="info" className="mt-3">
              These questions are written for this application as practice material. They are not official examination questions and no examining body is
              affiliated with SignalMaster Pro.
            </Alert>
          </Card>
        </div>
      </div>
    </div>
  );
}
