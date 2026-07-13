import type { AgentCommissionCustomer } from '@/lib/commissions/commission-store';

export type AgentCustomerSupplierGroup = {
  supplier: string;
  total: number;
  customers: AgentCommissionCustomer[];
};

function localeCompareInsensitive(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function groupAgentCustomersBySupplier(
  customers: AgentCommissionCustomer[],
): AgentCustomerSupplierGroup[] {
  const bySupplier = new Map<string, AgentCommissionCustomer[]>();
  for (const customer of customers) {
    const list = bySupplier.get(customer.supplier) ?? [];
    list.push(customer);
    bySupplier.set(customer.supplier, list);
  }

  return [...bySupplier.entries()]
    .map(([supplier, items]) => ({
      supplier,
      total: items.reduce((sum, customer) => sum + customer.amount, 0),
      customers: [...items].sort((a, b) => localeCompareInsensitive(a.company, b.company)),
    }))
    .sort((a, b) => {
      const rank = (supplier: string) => (supplier === 'Expense' ? 1 : 0);
      const rankDiff = rank(a.supplier) - rank(b.supplier);
      if (rankDiff !== 0) return rankDiff;
      return localeCompareInsensitive(a.supplier, b.supplier);
    });
}

function isCommissionLine(customer: AgentCommissionCustomer): boolean {
  return customer.lineKind !== 'expense' && customer.lineKind !== 'reconciliation';
}

export function expenseExportCell(customer: AgentCommissionCustomer): {
  amount: number | null;
  detail: string | null;
} {
  if (customer.lineKind === 'expense') {
    return { amount: customer.amount, detail: customer.expenseAllocation ?? 'Expense' };
  }
  if (customer.expenseDeduction && customer.expenseDeduction > 0.001) {
    return {
      amount: -customer.expenseDeduction,
      detail: customer.expenseAllocation ?? null,
    };
  }
  return { amount: null, detail: null };
}

export function reconciliationExportCell(customer: AgentCommissionCustomer): {
  amount: number | null;
  detail: string | null;
} {
  if (customer.lineKind === 'reconciliation') {
    return { amount: customer.amount, detail: customer.reconciliationAllocation ?? 'Reconciliation' };
  }
  if (customer.reconciliationDeduction && customer.reconciliationDeduction > 0.001) {
    return {
      amount: -customer.reconciliationDeduction,
      detail: customer.reconciliationAllocation ?? null,
    };
  }
  return { amount: null, detail: null };
}

export const AGENT_PAYMENT_DETAIL_HEADERS = [
  'Customer',
  'Our payment',
  'Rate',
  'Gross residual',
  'Expense',
  'Expense detail',
  'Reconciliation',
  'Reconciliation detail',
  'Net residual',
] as const;

export type AgentPaymentDetailRow = (string | number | null)[];

export function agentCustomerToDetailRow(customer: AgentCommissionCustomer): AgentPaymentDetailRow {
  const expense = expenseExportCell(customer);
  const reconciliation = reconciliationExportCell(customer);
  const commission = isCommissionLine(customer);

  return [
    customer.company,
    commission && customer.sourceAmount != null ? customer.sourceAmount : null,
    commission ? customer.commissionRate / 100 : null,
    commission ? (customer.grossResidual ?? customer.amount) : null,
    expense.amount,
    expense.detail,
    reconciliation.amount,
    reconciliation.detail,
    customer.amount,
  ];
}

export function buildAgentPaymentDetailRows(
  customers: AgentCommissionCustomer[],
): { rows: AgentPaymentDetailRow[]; subheaderRows: number[] } {
  const rows: AgentPaymentDetailRow[] = [Array.from(AGENT_PAYMENT_DETAIL_HEADERS)];
  const subheaderRows: number[] = [];
  const groups = groupAgentCustomersBySupplier(customers);

  for (const group of groups) {
    subheaderRows.push(rows.length);
    rows.push([
      group.supplier.toUpperCase(),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      group.total,
    ]);
    for (const customer of group.customers) {
      rows.push(agentCustomerToDetailRow(customer));
    }
  }

  if (rows.length === 1) {
    rows.push(['No customer breakdown for this period', null, null, null, null, null, null, null, null]);
  }

  return { rows, subheaderRows };
}
