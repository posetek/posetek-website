import { useState } from 'react';
import type { Row } from '../execution';
import { domainLabel } from '../../../../lib/contracts/types';
import { Eyebrow, InfoNote } from './MyWorkoutPlan';
import { sessionDateText } from './hub';
import { planWeeks } from './hub';

const humanized = (id: string) => String(id || '').replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').trim().toLowerCase().replace(/^./, c => c.toUpperCase());
const Detail = ({ title, value }: { title: string; value: string }) => <div className="wk-detail-row"><small>{title}</small><strong>{value || '—'}</strong></div>;

/** Plan details (`PlanDetailView`): the assessment, what the athlete told us, notes, and starting over. */
export default function PlanDetails({ plan, onStartNewPlan }: { plan: Row; onStartNewPlan: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const intake = plan.intake || {}, findings: Row[] = plan.assessment?.findings || [], gaps: string[] = plan.assessment?.dataGaps || [];
  const disclaimers: string[] = plan.disclaimers || [];
  const days = intake.daysPerWeek ?? intake.sessionsPerWeek ?? plan.sessionsPerWeek, minutes = intake.minutesPerSession ?? plan.minutesPerSession;
  return <div className="wk-plan">
    <div className="wk-week-headline"><Eyebrow>{`${planWeeks(plan)}-week block · started ${plan.startDate || ''}`}</Eyebrow><h2>Your plan</h2>{plan.generatedAt && <small className="wk-muted">Built {sessionDateText(plan.generatedAt)}</small>}</div>
    {plan.assessment?.summary && <section className="wk-card"><Eyebrow>Assessment</Eyebrow><p>{plan.assessment.summary}</p></section>}
    {!!findings.length && <div className="wk-stack"><p className="wk-section-title">Findings</p>{findings.map((f, i) => <section className="wk-card" key={i}><strong>{domainLabel(f.domain || '')}</strong><p className="wk-muted">{f.statement}</p>{!!f.metricIds?.length && <small className="wk-muted">From: {f.metricIds.map(humanized).join(', ')}</small>}</section>)}</div>}
    {!!gaps.length && <div><p className="wk-section-title">What the data couldn't show</p><section className="wk-card">{gaps.map((gap, i) => <InfoNote key={i} icon="help" text={gap} />)}</section></div>}
    <div><p className="wk-section-title">What you told us</p><section className="wk-card">
      <Detail title="Goals" value={(intake.goals || []).map(humanized).join(', ')} />
      <Detail title="Availability" value={days ? `${days}×/week · ${minutes} min` : ''} />
      <Detail title="Setting" value={humanized(intake.setting || '')} />
      {intake.level && <Detail title="Level" value={humanized(intake.level)} />}
      <Detail title="Equipment" value={(intake.equipment || []).length ? intake.equipment.map(humanized).join(', ') : 'None'} />
      {intake.freeTextGoals && <Detail title="Notes" value={intake.freeTextGoals} />}
    </section></div>
    <div><p className="wk-section-title">Worth knowing</p><section className="wk-card">
      {disclaimers.length ? disclaimers.map((line, i) => <InfoNote key={i} text={line} />) : <InfoNote text="No disclaimers were attached to this plan." />}
    </section></div>
    <div className="wk-stack"><p className="wk-section-title">Start over</p>
      {confirm ? <section className="wk-card" role="alertdialog" aria-label="Start a new plan?"><h3 className="wk-card-title">Start a new plan?</h3><p className="wk-muted">Your current plan stops here and is kept in your history. Progress you've already logged isn't deleted.</p>
        <div className="wk-button-row"><button type="button" className="wk-secondary" onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="wk-secondary" onClick={() => { setConfirm(false); onStartNewPlan(); }}>Start new plan</button></div></section>
        : <button type="button" className="wk-secondary" onClick={() => setConfirm(true)}><span className="material-symbols-outlined" aria-hidden="true">sync</span>Start a new plan</button>}
      <InfoNote text="Building a new plan replaces this one. Only one plan is active at a time." />
    </div>
  </div>;
}
