import {
  internetConnectionTypeLabel,
  type InternetAdditionalNeedId,
  type InternetConnectionTypeId,
} from '@/lib/internet/internet-quote-config';
import type {
  InternetPricingOption,
  InternetQuoteRequirements,
  InternetQuoteSnapshot,
} from '@/lib/internet/internet-quote-types';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import { INTERNET_QUOTE_ANSWER_KEYS } from '@/lib/internet/internet-quote-types';
import { formatServiceAddress } from '@/lib/internet/internet-quote-config';

function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export function requirementsFromQuoteRow(row: QuoteRequestRow): InternetQuoteRequirements {
  const answers = row.service_answers ?? {};
  const loc = row.location ?? {};
  const fromAnswers = String(answers[INTERNET_QUOTE_ANSWER_KEYS.serviceAddress] ?? '').trim();
  const formatted = formatServiceAddress({
    street: loc.street ?? undefined,
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    zip: loc.zip ?? undefined,
  });
  return {
    serviceAddress: fromAnswers || formatted,
    street: loc.street ?? undefined,
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    zip: loc.zip ?? undefined,
    connectionTypes: parseStringArray(
      answers[INTERNET_QUOTE_ANSWER_KEYS.connectionTypes],
    ) as InternetConnectionTypeId[],
    additionalNeeds: parseStringArray(
      answers[INTERNET_QUOTE_ANSWER_KEYS.additionalNeeds],
    ) as InternetAdditionalNeedId[],
    desiredSpeed: String(answers[INTERNET_QUOTE_ANSWER_KEYS.desiredSpeed] ?? '').trim(),
    billFilename:
      typeof answers.billFilename === 'string' ? answers.billFilename : undefined,
    billStoragePath:
      typeof answers.billStoragePath === 'string' ? answers.billStoragePath : undefined,
    analysisReviewId:
      typeof answers.analysisReviewId === 'string' ? answers.analysisReviewId : undefined,
  };
}

export function internetSnapshotFromDraft(
  draft: PublishedQuoteSnapshot | null,
  row: QuoteRequestRow,
): InternetQuoteSnapshot {
  const existing = draft?.internetQuote;
  if (existing?.requirements) {
    const fromRow = requirementsFromQuoteRow(row);
    return {
      ...existing,
      requirements: {
        ...fromRow,
        ...existing.requirements,
        connectionTypes: existing.requirements.connectionTypes?.length
          ? existing.requirements.connectionTypes
          : fromRow.connectionTypes,
        additionalNeeds: existing.requirements.additionalNeeds?.length
          ? existing.requirements.additionalNeeds
          : fromRow.additionalNeeds,
        desiredSpeed: existing.requirements.desiredSpeed || fromRow.desiredSpeed,
        street: existing.requirements.street ?? fromRow.street,
        city: existing.requirements.city ?? fromRow.city,
        state: existing.requirements.state ?? fromRow.state,
        zip: existing.requirements.zip ?? fromRow.zip,
        serviceAddress:
          existing.requirements.serviceAddress || fromRow.serviceAddress,
      },
      pricingOptions: existing.pricingOptions ?? [],
    };
  }
  return {
    requirements: requirementsFromQuoteRow(row),
    workflowStage: 'requirements',
    pricingOptions: [],
  };
}

export function scoreInternetPricingOption(
  option: InternetPricingOption,
  requirements: InternetQuoteRequirements,
): { score: number; highlights: string[] } {
  let score = 0;
  const highlights: string[] = [];
  const desired = requirements.desiredSpeed.trim().toLowerCase();
  const desiredMbps = Number(desired.replace(/[^\d.]/g, ''));

  for (const typeId of requirements.connectionTypes) {
    const label = internetConnectionTypeLabel(typeId).toLowerCase();
    if (option.supplierName.toLowerCase().includes('comcast') && label.includes('cable')) {
      score += 15;
      highlights.push('Matches Business Cable request');
    }
    if (option.supplierName.toLowerCase().includes('lumen') && label.includes('fiber')) {
      score += 15;
      highlights.push('Matches Ethernet (Fiber) request');
    }
    if (label.includes('wireless') && /wireless|fixed/i.test(option.parsedRawText ?? '')) {
      score += 10;
      highlights.push('Wireless option available');
    }
  }

  if (desiredMbps > 0) {
    const bestLine = option.lines.reduce<{ line: (typeof option.lines)[0]; diff: number } | null>(
      (acc, line) => {
        const down = line.downloadMbps ?? 0;
        if (!down) return acc;
        const diff = Math.abs(down - desiredMbps);
        if (!acc || diff < acc.diff) return { line, diff };
        return acc;
      },
      null,
    );
    if (bestLine) {
      if (bestLine.diff <= desiredMbps * 0.25) {
        score += 25;
        highlights.push(`Close to requested speed (${bestLine.line.label})`);
      } else if (bestLine.line.downloadMbps! >= desiredMbps) {
        score += 18;
        highlights.push(`Meets or exceeds requested speed`);
      }
    }
  }

  if (requirements.additionalNeeds.includes('5g_backup')) {
    if (/wireless connect|5g|backup/i.test(option.parsedRawText ?? '')) {
      score += 8;
      highlights.push('5G / wireless backup add-ons listed');
    }
  }
  if (requirements.additionalNeeds.includes('hardware')) {
    if (/router|wifi|meraki|equipment/i.test(option.parsedRawText ?? '')) {
      score += 6;
      highlights.push('Hardware / router options listed');
    }
  }

  if (option.serviceabilitySummary && /yellow|green/i.test(option.serviceabilitySummary)) {
    score += 12;
    highlights.push('Favorable serviceability on pricing sheet');
  }

  return { score, highlights };
}

export function applyMatchScores(
  options: InternetPricingOption[],
  requirements: InternetQuoteRequirements,
): InternetPricingOption[] {
  return options.map((opt) => {
    const { score, highlights } = scoreInternetPricingOption(opt, requirements);
    return { ...opt, matchScore: score, matchHighlights: highlights };
  });
}

export function buildScoutRequestEmailBody(row: QuoteRequestRow, requirements: InternetQuoteRequirements): string {
  const types = requirements.connectionTypes
    .map((id) => internetConnectionTypeLabel(id))
    .join(', ');
  const needs = requirements.additionalNeeds.length
    ? requirements.additionalNeeds.join(', ')
    : 'None specified';
  const addr = requirements.serviceAddress || formatServiceAddress(requirements);
  return [
    `Business name: ${row.company?.trim() || '—'}`,
    `Primary contact: ${row.contact_name?.trim() || '—'}`,
    `Email: ${row.contact_email?.trim() || '—'}`,
    `Phone: ${row.contact_phone?.trim() || '—'}`,
    `Service address: ${addr || '—'}`,
    '',
    `Desired internet type(s): ${types || '—'}`,
    `Desired speed: ${requirements.desiredSpeed || '—'}`,
    `Additional needs: ${needs}`,
    '',
    row.note?.trim() ? `Notes: ${row.note.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
