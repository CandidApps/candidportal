/** CSS “screen grabs” of the Candid IQ portal — decorative product visuals for marketing. */

export function DashboardMock() {
  return (
    <div className="mkt-frame" aria-hidden>
      <div className="mkt-frame-bar">
        <span className="mkt-dot" />
        <span className="mkt-dot" />
        <span className="mkt-dot" />
        <span className="mkt-frame-title">Spend &amp; contracts</span>
      </div>
      <div className="mkt-frame-body">
        <div className="mkt-mock-rail">
          <span className="active" />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="mkt-mock-main">
          <div className="mkt-mock-grid">
            <div className="mkt-card">
              <div className="mkt-card-label">Identified savings</div>
              <div className="mkt-stat">
                $48,320<em>/yr</em>
              </div>
              <div className="mkt-mini-row">
                <span>Comcast Business</span>
                <span className="mkt-pill">−18%</span>
              </div>
              <div className="mkt-mini-row">
                <span>SaaS renewals</span>
                <span className="mkt-pill">−22%</span>
              </div>
              <div className="mkt-mini-row">
                <span>Card processing</span>
                <span className="mkt-pill">−0.41%</span>
              </div>
            </div>
            <div className="mkt-card">
              <div className="mkt-card-label">Renewal radar</div>
              <div className="mkt-mini-row">
                <span>Dialpad</span>
                <span className="mkt-pill--warn mkt-pill">14d</span>
              </div>
              <div className="mkt-mini-row">
                <span>Microsoft 365</span>
                <span className="mkt-pill--warn mkt-pill">32d</span>
              </div>
              <div className="mkt-mini-row">
                <span>Spectrum</span>
                <span className="mkt-pill">68d</span>
              </div>
              <div className="mkt-mini-row">
                <span>Utilities</span>
                <span className="mkt-pill">Q3</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FrankMock() {
  return (
    <div className="mkt-frame" aria-hidden>
      <div className="mkt-frame-bar">
        <span className="mkt-dot" />
        <span className="mkt-dot" />
        <span className="mkt-dot" />
        <span className="mkt-frame-title">Frank · candid AI</span>
      </div>
      <div className="mkt-frame-body" style={{ gridTemplateColumns: '1fr' }}>
        <div className="mkt-mock-main">
          <div className="mkt-frank">
            <div className="mkt-frank-msg mkt-frank-msg--user">
              <strong>You</strong>
              Negotiate our internet renewal. We&apos;re paying $892/mo for 1 Gig — market is closer to
              $640. Don&apos;t accept retention fluff.
            </div>
            <div className="mkt-frank-msg mkt-frank-msg--ai">
              <strong>Frank</strong>
              Got it. I pulled your contract, mapped 3 comparable quotes, and queued a specialist to
              call the carrier. Target: <b>$620–$660</b> with a 24-mo term.
              <div className="mkt-frank-actions">
                <button type="button">Approve playbook</button>
                <button type="button">Add context</button>
                <button type="button">Watch live</button>
              </div>
            </div>
            <div className="mkt-frank-msg mkt-frank-msg--ai">
              <strong>Update · 41 min later</strong>
              Carrier counter at $649. Specialist locked it. Savings:{' '}
              <span className="mkt-pill">$2,916 / yr</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketplaceMock() {
  const services = [
    { code: 'UC', name: 'UCaaS & Contact Center', blurb: 'Compare Dialpad, RingCentral, Zoom…' },
    { code: 'NET', name: 'Fiber & SD-WAN', blurb: 'Quotes from 12+ carriers in one ticket' },
    { code: 'PAY', name: 'Payments & PoS', blurb: 'Rate analysis + statement unlock' },
    { code: 'SEC', name: 'Cyber & Managed IT', blurb: 'Stack recommendations with SLAs' },
  ];

  return (
    <div className="mkt-frame" aria-hidden>
      <div className="mkt-frame-bar">
        <span className="mkt-dot" />
        <span className="mkt-dot" />
        <span className="mkt-dot" />
        <span className="mkt-frame-title">Marketplace</span>
      </div>
      <div className="mkt-frame-body" style={{ gridTemplateColumns: '1fr' }}>
        <div className="mkt-mock-main">
          <div className="mkt-market-grid">
            {services.map((s) => (
              <div key={s.code} className="mkt-svc">
                <div className="mkt-svc-top">
                  <span className="mkt-svc-logo">{s.code}</span>
                  <span className="mkt-pill">Quote</span>
                </div>
                <h4>{s.name}</h4>
                <p>{s.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PartnerPortalMock() {
  return (
    <div className="mkt-frame" aria-hidden>
      <div className="mkt-frame-bar">
        <span className="mkt-dot" />
        <span className="mkt-dot" />
        <span className="mkt-dot" />
        <span className="mkt-frame-title">YourBrand Portal · white label</span>
      </div>
      <div className="mkt-frame-body">
        <div className="mkt-mock-rail">
          <span className="active" />
          <span />
          <span />
          <span />
        </div>
        <div className="mkt-mock-main">
          <div className="mkt-mock-grid">
            <div className="mkt-card">
              <div className="mkt-card-label">This week</div>
              <div className="mkt-mini-row">
                <span>Open quotes</span>
                <strong>14</strong>
              </div>
              <div className="mkt-mini-row">
                <span>Helpdesk tickets</span>
                <strong>27</strong>
              </div>
              <div className="mkt-mini-row">
                <span>Contracts renewing</span>
                <span className="mkt-pill--live mkt-pill">6</span>
              </div>
              <div className="mkt-mini-row">
                <span>Invoices sent</span>
                <strong>$86.4k</strong>
              </div>
            </div>
            <div className="mkt-card">
              <div className="mkt-card-label">Frank for agents</div>
              <div className="mkt-frank-msg mkt-frank-msg--ai" style={{ maxWidth: '100%' }}>
                Drafted a multi-location UCaaS proposal for Acme Dental — 3 sites, Dialpad vs
                RingCentral. Ready for your review.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
