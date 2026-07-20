'use client';

import { useEffect, useState } from 'react';

type Phase = 'typing-user' | 'thinking' | 'typing-frank' | 'actions' | 'update' | 'pause';

const USER_TEXT =
  'Negotiate our internet renewal. We\'re paying $892/mo for 1 Gig — market is closer to $640. Don\'t accept retention fluff.';

const FRANK_TEXT =
  'Got it. I pulled your contract, mapped 3 comparable quotes, and queued a specialist to call the carrier. Target: $620–$660 with a 24-mo term.';

export function FrankLiveMock() {
  const [phase, setPhase] = useState<Phase>('typing-user');
  const [userChars, setUserChars] = useState(0);
  const [frankChars, setFrankChars] = useState(0);
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if (phase === 'typing-user') {
      if (userChars < USER_TEXT.length) {
        const t = setTimeout(() => setUserChars((n) => n + 1), 18 + Math.random() * 22);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase('thinking'), 400);
      return () => clearTimeout(t);
    }

    if (phase === 'thinking') {
      const t = setTimeout(() => setPhase('typing-frank'), 1400);
      return () => clearTimeout(t);
    }

    if (phase === 'typing-frank') {
      if (frankChars < FRANK_TEXT.length) {
        const t = setTimeout(() => setFrankChars((n) => n + 1), 12 + Math.random() * 16);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase('actions'), 500);
      return () => clearTimeout(t);
    }

    if (phase === 'actions') {
      const t = setTimeout(() => {
        setShowUpdate(true);
        setPhase('update');
      }, 1800);
      return () => clearTimeout(t);
    }

    if (phase === 'update') {
      const t = setTimeout(() => setPhase('pause'), 3200);
      return () => clearTimeout(t);
    }

    if (phase === 'pause') {
      const t = setTimeout(() => {
        setUserChars(0);
        setFrankChars(0);
        setShowUpdate(false);
        setPhase('typing-user');
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [phase, userChars, frankChars]);

  return (
    <div className="mkt-frame mkt-frame--live" aria-hidden>
      <div className="mkt-frame-bar">
        <span className="mkt-dot" />
        <span className="mkt-dot" />
        <span className="mkt-dot" />
        <span className="mkt-frame-title">Frank · candid AI</span>
        <span className="mkt-live-badge is-on">
          <span className="mkt-live-badge-dot" />
          Live
        </span>
      </div>
      <div className="mkt-frame-body mkt-frame-body--chat">
        <div className="mkt-mock-main">
          <div className="mkt-frank mkt-frank--live">
            {userChars > 0 ? (
              <div className="mkt-frank-msg mkt-frank-msg--user mkt-frank-msg--typing">
                <strong>You</strong>
                {USER_TEXT.slice(0, userChars)}
                {phase === 'typing-user' && userChars < USER_TEXT.length ? (
                  <span className="mkt-cursor" />
                ) : null}
              </div>
            ) : null}

            {phase !== 'typing-user' ? (
              <div
                className={`mkt-frank-msg mkt-frank-msg--ai mkt-anim-in is-visible${
                  phase === 'thinking' ? ' is-thinking' : ''
                }`}
              >
                <strong>Frank</strong>
                {phase === 'thinking' ? (
                  <span className="mkt-typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  <>
                    {FRANK_TEXT.slice(0, frankChars)}
                    {phase === 'typing-frank' && frankChars < FRANK_TEXT.length ? (
                      <span className="mkt-cursor" />
                    ) : null}
                  </>
                )}
                {(phase === 'actions' || phase === 'update' || phase === 'pause') && frankChars >= FRANK_TEXT.length ? (
                  <div className="mkt-frank-actions mkt-anim-in is-visible">
                    <button type="button" className="is-active">
                      Approve playbook
                    </button>
                    <button type="button">Add context</button>
                    <button type="button">Watch live</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {showUpdate ? (
              <div className="mkt-frank-msg mkt-frank-msg--ai mkt-frank-msg--success mkt-anim-in is-visible">
                <strong>Update · 41 min later</strong>
                Carrier counter at $649. Specialist locked it. Savings:{' '}
                <span className="mkt-pill mkt-pill--save">$2,916 / yr</span>
              </div>
            ) : null}
          </div>

          <div className="mkt-frank-status">
            <div className={`mkt-status-step${phase === 'typing-user' ? ' is-active' : ' is-done'}`}>
              <span>1</span> You ask
            </div>
            <div className={`mkt-status-step${phase === 'thinking' || phase === 'typing-frank' ? ' is-active' : ['actions', 'update', 'pause'].includes(phase) ? ' is-done' : ''}`}>
              <span>2</span> Frank plans
            </div>
            <div className={`mkt-status-step${phase === 'actions' ? ' is-active' : ['update', 'pause'].includes(phase) ? ' is-done' : ''}`}>
              <span>3</span> Specialist calls
            </div>
            <div className={`mkt-status-step${phase === 'update' || phase === 'pause' ? ' is-active is-done' : ''}`}>
              <span>4</span> Done
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
