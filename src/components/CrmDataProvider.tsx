'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Customer } from '@/components/CustomersView';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import type { BmwAgentRate, BmwDeal } from '@/lib/bmw/types';
import type { CrmRuntimeData } from '@/lib/crm/runtime-store';
import { hydrateCrmRuntime } from '@/lib/crm/hydrate-runtime';
import { getCrmRuntimeData } from '@/lib/crm/runtime-store';

type CrmContextValue = CrmRuntimeData & {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const CrmContext = createContext<CrmContextValue | null>(null);

const EMPTY: CrmContextValue = {
  customers: [],
  documentsByCustomerId: {},
  contractsByCustomerId: {},
  bmwDeals: [],
  agentRates: [],
  source: 'empty',
  ready: false,
  loading: true,
  error: null,
  refresh: async () => {},
};

export function CrmDataProvider({
  enabled,
  portalCustomerId,
  children,
}: {
  enabled: boolean;
  portalCustomerId?: string | null;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CrmContextValue>(EMPTY);

  const load = async () => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const endpoint = portalCustomerId
        ? `/api/portal/crm?customerId=${encodeURIComponent(portalCustomerId)}`
        : '/api/admin/crm/bootstrap';
      const res = await fetch(endpoint);
      const data = (await res.json()) as CrmRuntimeData & { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to load CRM');
      }
      hydrateCrmRuntime({
        customers: data.customers ?? [],
        documentsByCustomerId: data.documentsByCustomerId ?? {},
        contractsByCustomerId: data.contractsByCustomerId ?? {},
        bmwDeals: data.bmwDeals ?? [],
        agentRates: data.agentRates ?? [],
        source: data.source ?? 'empty',
      });
      const dealMasterReady =
        (data.bmwDeals?.length ?? 0) > 0 && (data.agentRates?.length ?? 0) > 0;
      setState({
        customers: data.customers ?? [],
        documentsByCustomerId: data.documentsByCustomerId ?? {},
        contractsByCustomerId: data.contractsByCustomerId ?? {},
        bmwDeals: data.bmwDeals ?? [],
        agentRates: data.agentRates ?? [],
        source: data.source ?? 'empty',
        ready: Boolean(data.customers?.length) && dealMasterReady,
        loading: false,
        error: data.customers?.length ? null : data.message ?? null,
        refresh: load,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load CRM',
      }));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, portalCustomerId]);

  const value = useMemo(() => ({ ...state, refresh: load }), [state]);

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrmData(): CrmContextValue {
  const ctx = useContext(CrmContext);
  if (!ctx) {
    const runtime = getCrmRuntimeData();
    return {
      ...runtime,
      loading: !runtime.ready,
      error: null,
      refresh: async () => {},
    };
  }
  return ctx;
}

export function useCrmCustomers(): Customer[] {
  return useCrmData().customers;
}

export function useCrmDocuments(): Record<string, CustomerDocument[]> {
  return useCrmData().documentsByCustomerId;
}

export function useCrmContracts(): Record<string, CandidContractRecord[]> {
  return useCrmData().contractsByCustomerId;
}
