'use client';

import { useEffect, useRef, useState } from 'react';

const STEPS = [
  {
    id: 'ask',
    label: 'You ask',
    title: '"Is this Salesforce quote fair?"',
    body: 'Forward a renewal, paste a quote, or just ask in plain English. No forms, no discovery call, no "let me loop in the team."',
    metric: '$185/seat quoted',
    previewTitle: 'Frank · new message',
  },
  {
    id: 'benchmark',
    label: 'Frank benchmarks',
    title: 'Market data + your contract context',
    body: 'Frank checks it against real negotiated outcomes across 300+ providers, then tells you the truth — including exactly how much leverage you have.',
    metric: 'Market avg: $142/seat',
    previewTitle: 'Frank · benchmark',
  },
  {
    id: 'execute',
    label: 'Specialist negotiates',
    title: 'Humans pick up the hard part',
    body: 'A Candid specialist runs the approved playbook — the emails, the hold music, the "let me check with my manager" — so you never have to.',
    metric: 'Counter sent · awaiting reply',
    previewTitle: 'Task · Salesforce renewal',
  },
  {
    id: 'result',
    label: 'Savings land',
    title: 'Done. Logged in your portal.',
    body: 'New terms signed, savings tracked, renewal radar reset. Not a to-do list and a pat on the back — an actual result.',
    metric: '$18,400 saved · 18% off',
    previewTitle: 'Portal · savings',
  },
] as const;

function PreviewPane({ stepId }: { stepId: (typeof STEPS)[number]['id'] }) {
  if (stepId === 'ask') {
    return (
      <div className="mkt-flow-ui mkt-flow-ui--chat">
        <div className="mkt-flow-bubble mkt-flow-bubble--you">
          Is this Salesforce quote fair? $185/seat for 40 seats.
        </div>
        <div className="mkt-flow-bubble mkt-flow-bubble--frank">
          <strong>Frank</strong>
          Got it — pulling market comps and your last renewal terms…
        </div>
      </div>
    );
  }

  if (stepId === 'benchmark') {
    return (
      <div className="mkt-flow-ui">
        <div className="mkt-flow-compare">
          <div className="mkt-flow-compare-col">
            <span>Their quote</span>
            <strong>$185</strong>
            <em>/seat</em>
          </div>
          <div className="mkt-flow-compare-col mkt-flow-compare-col--win">
            <span>Market avg</span>
            <strong>$142</strong>
            <em>/seat</em>
          </div>
        </div>
        <div className="mkt-flow-ui-note">You&apos;re ~30% above similar deals. Worth negotiating.</div>
      </div>
    );
  }

  if (stepId === 'execute') {
    return (
      <div className="mkt-flow-ui">
        <div className="mkt-flow-task-row">
          <span className="mkt-flow-task-status">In progress</span>
          <span>Salesforce Enterprise · 40 seats</span>
        </div>
        <ul className="mkt-flow-task-list">
          <li className="is-done">Playbook approved</li>
          <li className="is-done">Counter offer emailed</li>
          <li className="is-live">
            <span className="mkt-flow-call-ring" />
            Specialist on hold with vendor · 23:41
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="mkt-flow-ui">
      <div className="mkt-flow-result-hero">
        <span>Annual savings logged</span>
        <strong>$18,400</strong>
      </div>
      <div className="mkt-flow-result-row">
        <span>New rate</span>
        <span>$152/seat · 18% off quote</span>
      </div>
      <div className="mkt-flow-result-row">
        <span>Contract</span>
        <span>Updated in vault</span>
      </div>
    </div>
  );
}

export function FrankFlowDemo() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const nodes = stepRefs.current.filter(Boolean) as HTMLElement[];
    if (nodes.length === 0) return;

    // Activate when a step crosses the sticky preview’s vertical band (mid-viewport).
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0];
        if (!top?.target) return;
        const index = nodes.indexOf(top.target as HTMLElement);
        if (index >= 0) setActive(index);
      },
      {
        root: null,
        threshold: [0.25, 0.5, 0.75],
        rootMargin: '-28% 0px -42% 0px',
      },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const current = STEPS[active];

  return (
    <section className="mkt-flow-section">
      <div className="mkt-wrap">
        <div className="mkt-section-head center">
          <div className="mkt-kicker">Question → result</div>
          <h2>From &quot;is this a good deal?&quot; to savings in the portal.</h2>
          <p>
            Most AI stops at &quot;here&apos;s a draft email — good luck.&quot; Frank builds the plan,
            hands it to a Candid specialist, and doesn&apos;t call it done until the savings are
            sitting in your portal.
          </p>
        </div>

        <div className="mkt-flow">
          <div className="mkt-flow-steps">
            {STEPS.map((step, i) => (
              <article
                key={step.id}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                id={`flow-step-${step.id}`}
                className={`mkt-flow-card${i === active ? ' is-active' : ''}${i < active ? ' is-past' : ''}`}
              >
                <span className="mkt-flow-card-num" aria-hidden>
                  {i + 1}
                </span>
                <div className="mkt-flow-card-copy">
                  <div className="mkt-flow-card-kicker">{step.label}</div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <div className="mkt-flow-metric">{step.metric}</div>
                </div>
              </article>
            ))}
          </div>

          <div className="mkt-flow-stage">
            <div className="mkt-flow-preview" aria-hidden>
              <div className="mkt-flow-preview-bar">
                <span className="mkt-dot" />
                <span className="mkt-dot" />
                <span className="mkt-dot" />
                <span className="mkt-frame-title">{current.previewTitle}</span>
              </div>
              <div className="mkt-flow-preview-body">
                {STEPS.map((step, i) => (
                  <div
                    key={step.id}
                    className={`mkt-flow-preview-pane${i === active ? ' is-visible' : ''}`}
                  >
                    <PreviewPane stepId={step.id} />
                  </div>
                ))}
              </div>
              <p className="mkt-flow-preview-caption">
                One task, start to finish: question, leverage, negotiation, receipt.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
