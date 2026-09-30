import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEarningsSnapshot,
  computeEarnings,
  defaultEarningsMode,
  floorToHalfPct,
  isSellingAgentId,
  previewCandidNetPct,
  previewCashBackPct,
  previewMaxCashBackPct,
  snapshotMatches,
} from './payout-engine';

describe('floorToHalfPct', () => {
  it('floors to the nearest 0.5', () => {
    assert.equal(floorToHalfPct(3.4), 3);
    assert.equal(floorToHalfPct(1.7), 1.5);
    assert.equal(floorToHalfPct(1.5), 1.5);
    assert.equal(floorToHalfPct(0.49), 0);
    assert.equal(floorToHalfPct(-2), 0);
  });
});

describe('worked example — 8x8 locked on Telarus at 17% Candid net', () => {
  it('Paid member with agent: 3.0% cash back, 1.5% agent, 12.5% Candid', () => {
    const r = computeEarnings({ candidNetPct: 17, memberTier: 'paid', hasAgent: true });
    assert.equal(r.earningsMode, 'split');
    assert.equal(r.customerCashBackPct, 3);
    assert.equal(r.agentPct, 1.5);
    assert.equal(r.candidRemainderPct, 12.5);
  });

  it('Basic member with agent: 1.5% cash back, 1.5% agent, 14.0% Candid', () => {
    const r = computeEarnings({ candidNetPct: 17, memberTier: 'basic', hasAgent: true });
    assert.equal(r.customerCashBackPct, 1.5);
    assert.equal(r.agentPct, 1.5);
    assert.equal(r.candidRemainderPct, 14);
  });

  it('no agent: Paid keeps 14.0%, Basic keeps 15.5%', () => {
    assert.equal(computeEarnings({ candidNetPct: 17, memberTier: 'paid', hasAgent: false }).candidRemainderPct, 14);
    assert.equal(computeEarnings({ candidNetPct: 17, memberTier: 'basic', hasAgent: false }).candidRemainderPct, 15.5);
  });

  it('expresses the agent share as % of Candid residual dollars', () => {
    const r = computeEarnings({ candidNetPct: 17, memberTier: 'paid', hasAgent: true });
    assert.equal(r.agentRateOfCandidResidualPct, 8.8235);
  });
});

describe('cash-back floors', () => {
  it('net under 5%: no cash back', () => {
    const r = computeEarnings({ candidNetPct: 4.5, memberTier: 'paid', hasAgent: false });
    assert.equal(r.customerCashBackPct, 0);
    assert.equal(r.candidRemainderPct, 4.5);
  });

  it('net under 5% even when ops forces customer_only', () => {
    const r = computeEarnings({
      candidNetPct: 4.9,
      memberTier: 'paid',
      customerSharePct: 50,
      hasAgent: false,
      earningsMode: 'customer_only',
    });
    assert.equal(r.customerCashBackPct, 0);
  });

  it('5–10% self-signup: customer tier share, agent off', () => {
    const r = computeEarnings({ candidNetPct: 8, memberTier: 'paid', hasAgent: true, agentRegistered: false });
    assert.equal(r.earningsMode, 'customer_only');
    assert.equal(r.customerCashBackPct, 1.5);
    assert.equal(r.agentPct, 0);
  });

  it('5–10% agent-registered: agent only by default', () => {
    const r = computeEarnings({ candidNetPct: 8, memberTier: 'paid', hasAgent: true });
    assert.equal(r.earningsMode, 'agent_only');
    assert.equal(r.customerCashBackPct, 0);
    assert.equal(r.agentPct, 0.5);
  });

  it('5–10% agent-registered: ops can split', () => {
    const r = computeEarnings({ candidNetPct: 8, memberTier: 'paid', hasAgent: true, earningsMode: 'split' });
    assert.equal(r.modeOverridden, true);
    assert.equal(r.customerCashBackPct, 1.5);
    assert.equal(r.agentPct, 0.5);
  });

  it('never offers cash back under 1% after rounding', () => {
    const r = computeEarnings({ candidNetPct: 9, memberTier: 'basic', hasAgent: false });
    assert.equal(r.rawCustomerPct, 0.9);
    assert.equal(r.customerCashBackPct, 0);
    assert.ok(r.notes.some((n) => n.includes('under 1%')));
  });

  it('≥10% agent-registered marked agent-only: no cash back', () => {
    const r = computeEarnings({ candidNetPct: 17, memberTier: 'paid', hasAgent: true, earningsMode: 'agent_only' });
    assert.equal(r.customerCashBackPct, 0);
    assert.equal(r.agentPct, 1.5);
    assert.equal(r.candidRemainderPct, 15.5);
  });

  it('agent-only without an agent falls back to customer only', () => {
    const r = computeEarnings({ candidNetPct: 17, memberTier: 'paid', hasAgent: false, earningsMode: 'agent_only' });
    assert.equal(r.earningsMode, 'customer_only');
    assert.equal(r.customerCashBackPct, 3);
  });
});

describe('share overrides', () => {
  it('deal share beats customer profile, customer-agent split, and tier', () => {
    const r = computeEarnings({
      candidNetPct: 20,
      memberTier: 'basic',
      dealCustomerSharePct: 30,
      customerSharePct: 25,
      customerAgentSharePct: 15,
      hasAgent: false,
    });
    assert.equal(r.customerSharePct, 30);
    assert.equal(r.customerCashBackPct, 6);
  });

  it('customer-agent split applies when no customer override', () => {
    const r = computeEarnings({ candidNetPct: 20, memberTier: 'basic', customerAgentSharePct: 15, hasAgent: false });
    assert.equal(r.customerCashBackPct, 3);
  });

  it('deal agent share beats agent profile', () => {
    const r = computeEarnings({
      candidNetPct: 20,
      memberTier: 'paid',
      hasAgent: true,
      agentSharePct: 15,
      dealAgentSharePct: 25,
    });
    assert.equal(r.agentPct, 5);
  });
});

describe('defaultEarningsMode', () => {
  it('follows the floors table', () => {
    assert.equal(defaultEarningsMode({ candidNetPct: 17, hasAgent: false }), 'customer_only');
    assert.equal(defaultEarningsMode({ candidNetPct: 17, hasAgent: true }), 'split');
    assert.equal(defaultEarningsMode({ candidNetPct: 7, hasAgent: true }), 'agent_only');
    assert.equal(defaultEarningsMode({ candidNetPct: 7, hasAgent: true, agentRegistered: false }), 'customer_only');
    assert.equal(defaultEarningsMode({ candidNetPct: 3, hasAgent: true, agentRegistered: false }), 'agent_only');
  });
});

describe('preview (pay source unknown)', () => {
  const shareByKey = { intelisys: 80, sandler: 80, telarus: 85, appdirect_telco: 85, appdirect_saas: 80 };
  const product = {
    gross_rate_pct: 20,
    intelisys_supported: true,
    sandler_supported: true,
    telarus_supported: true,
    appdirect_supported: true,
  };

  it('uses the max supported partner net (column O)', () => {
    assert.equal(previewCandidNetPct(product, shareByKey), 17);
    assert.equal(previewCandidNetPct({ ...product, telarus_supported: false, appdirect_supported: false }, shareByKey), 16);
  });

  it('member-facing cash back by tier', () => {
    assert.equal(previewCashBackPct(17, 'paid'), 3);
    assert.equal(previewCashBackPct(17, 'basic'), 1.5);
    assert.equal(previewCashBackPct(null, 'paid'), 0);
  });

  it('Up to = highest line', () => {
    assert.equal(previewMaxCashBackPct([8, 17, 12.5], 'paid'), 3);
  });
});

describe('snapshot', () => {
  it('stores pay source, net, shares, and mode', () => {
    const snap = buildEarningsSnapshot({
      candidNetPct: 17,
      memberTier: 'paid',
      hasAgent: true,
      paySource: 'Telarus',
      lockedAt: '2026-09-29T00:00:00.000Z',
    });
    assert.deepEqual(snap, {
      version: 1,
      lockedAt: '2026-09-29T00:00:00.000Z',
      paySource: 'Telarus',
      paySourcePartner: 'telarus',
      candidNetPct: 17,
      memberTier: 'paid',
      customerSharePct: 20,
      agentSharePct: 10,
      earningsMode: 'split',
      modeOverridden: false,
      customerCashBackPct: 3,
      agentPct: 1.5,
      agentRateOfCandidResidualPct: 8.8235,
      candidRemainderPct: 12.5,
    });
  });

  it('matches only when inputs are unchanged', () => {
    const snap = buildEarningsSnapshot({ candidNetPct: 17, memberTier: 'paid', hasAgent: true, paySource: 'Telarus' });
    const same = { candidNetPct: 17, memberTier: 'paid' as const, hasAgent: true, paySource: 'Telarus' };
    assert.equal(snapshotMatches(snap, same), true);
    assert.equal(snapshotMatches(snap, { ...same, memberTier: 'basic' }), false);
    assert.equal(snapshotMatches(snap, { ...same, candidNetPct: 16 }), false);
    assert.equal(snapshotMatches(snap, { ...same, earningsMode: 'agent_only' }), false);
    assert.equal(snapshotMatches(snap, { ...same, paySource: 'Intelisys' }), false);
  });
});

describe('isSellingAgentId', () => {
  it('excludes member self-agents', () => {
    assert.equal(isSellingAgentId('MEMBER-LOCAL-ACME'), false);
    assert.equal(isSellingAgentId(''), false);
    assert.equal(isSellingAgentId('A123'), true);
  });
});
