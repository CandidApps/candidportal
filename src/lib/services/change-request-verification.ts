import type { ChangeRequest, ChangeReview } from '@/lib/services/product-change-requests';

export type VerificationVerdict = 'aligned' | 'minor_gaps' | 'blocked';

export type VerificationCheck = {
  name: string;
  status: 'pass' | 'warn' | 'gap';
  detail: string;
};

export type GitWorktreeSnapshot = {
  available: boolean;
  branch: string;
  filesChanged: string[];
  diffStat: string;
  error?: string;
};

export type VerificationResult = {
  verdict: VerificationVerdict;
  checks: VerificationCheck[];
  summary: string;
  git: GitWorktreeSnapshot;
  suggestedRelatedFiles: string[];
};

const PLAID_PATH_RE = /plaid|tech-spend|mspend|tech_spend/i;
const MIGRATION_PATH_RE = /^supabase\/migrations\//;

function parseRelatedFiles(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/\\/g, '/');
}

function fileMatchesRelated(file: string, related: string): boolean {
  const f = normalizePath(file);
  const r = normalizePath(related);
  if (f === r) return true;
  if (f.startsWith(r) || r.startsWith(f)) return true;
  if (f.endsWith(r) || r.endsWith(f)) return true;
  const fBase = f.split('/').pop() ?? f;
  const rBase = r.split('/').pop() ?? r;
  return fBase === rBase && fBase.length > 4;
}

function parseOutOfScopeFlags(outOfScope: string): { noPlaid: boolean; noMigrations: boolean } {
  const lower = outOfScope.toLowerCase();
  return {
    noPlaid: /\bplaid\b|\btech spend\b/.test(lower),
    noMigrations: /\bmigration\b|\bschema\b/.test(lower) && /\bno\b|\bnot\b|\bwithout\b/.test(lower),
  };
}

function inferAreasFromPaths(files: string[]): string[] {
  const areas = new Set<string>();
  for (const f of files) {
    if (/src\/components\/admin\/AdminRoadmap|product-roadmap|product-change|change-request/i.test(f)) {
      areas.add('Product roadmap');
    }
    if (/src\/components\/customers|src\/lib\/crm/i.test(f)) {
      areas.add('Accounts / CRM');
    }
    if (/MemberDashboard|member-portal|src\/components\/member/i.test(f)) {
      areas.add('Member Dashboard');
    }
    if (/MyAssistant|assistant/i.test(f)) {
      areas.add('MyAssistant');
    }
    if (/quote/i.test(f)) {
      areas.add('Quotes & Proposals');
    }
    if (/supabase\/migrations/i.test(f)) {
      areas.add('Database / migrations');
    }
    if (PLAID_PATH_RE.test(f)) {
      areas.add('Tech Spend');
    }
  }
  return [...areas];
}

function parseAppAreas(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function areasOverlap(declared: string[], inferred: string[]): boolean {
  if (!declared.length || !inferred.length) return true;
  const d = declared.map((a) => a.toLowerCase());
  return inferred.some((inf) => d.some((a) => a.includes(inf.toLowerCase()) || inf.toLowerCase().includes(a)));
}

function computeVerdict(checks: VerificationCheck[]): VerificationVerdict {
  if (checks.some((c) => c.status === 'gap')) return 'blocked';
  if (checks.some((c) => c.status === 'warn')) return 'minor_gaps';
  return 'aligned';
}

function formatSummaryMarkdown(
  change: ChangeRequest,
  verdict: VerificationVerdict,
  checks: VerificationCheck[],
  git: GitWorktreeSnapshot,
): string {
  const lines = [
    `**${change.public_id}** — ${verdict.replace('_', ' ').toUpperCase()}`,
    '',
    git.available
      ? `Branch: \`${git.branch || '(detached)'}\` · ${git.filesChanged.length} file(s) changed`
      : `Git: ${git.error ?? 'unavailable'}`,
    '',
    '| Check | Result |',
    '|-------|--------|',
  ];
  for (const c of checks) {
    const icon = c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗';
    lines.push(`| ${c.name} | ${icon} ${c.detail} |`);
  }
  if (verdict === 'aligned') {
    lines.push('', 'Spec and local changes look aligned. Proceed if status allows.');
  } else if (verdict === 'minor_gaps') {
    lines.push('', 'Review warnings — update the spec or code, then re-run.');
  } else {
    lines.push('', 'Fix blocked gaps before push or PR.');
  }
  return lines.join('\n');
}

export function verifyChangeRequestAgainstGit(
  change: ChangeRequest,
  git: GitWorktreeSnapshot,
  reviews: ChangeReview[] = [],
): VerificationResult {
  const checks: VerificationCheck[] = [];
  const related = parseRelatedFiles(change.related_files);
  const files = git.filesChanged.map(normalizePath);
  const suggestedRelatedFiles = [...files].slice(0, 24);

  if (!git.available) {
    checks.push({
      name: 'Local git',
      status: 'warn',
      detail: git.error ?? 'Git not available — run locally or use Copy: verify in Cursor',
    });
    const verdict = 'minor_gaps';
    return {
      verdict,
      checks,
      summary: formatSummaryMarkdown(change, verdict, checks, git),
      git,
      suggestedRelatedFiles,
    };
  }

  if (files.length === 0) {
    checks.push({
      name: 'Local changes',
      status: 'warn',
      detail: 'No uncommitted changes — verify against committed branch diff in Cursor if already committed',
    });
  } else {
    checks.push({
      name: 'Local changes',
      status: 'pass',
      detail: `${files.length} file(s): ${files.slice(0, 4).join(', ')}${files.length > 4 ? '…' : ''}`,
    });
  }

  if (change.linked_branch.trim()) {
    const linked = change.linked_branch.trim();
    const current = git.branch.trim();
    if (current && linked && current !== linked) {
      checks.push({
        name: 'Branch',
        status: 'warn',
        detail: `On \`${current}\`, CR expects \`${linked}\``,
      });
    } else {
      checks.push({
        name: 'Branch',
        status: 'pass',
        detail: current ? `Matches \`${current}\`` : 'Branch OK',
      });
    }
  }

  if (files.length && related.length) {
    const unmatchedDiff = files.filter((f) => !related.some((r) => fileMatchesRelated(f, r)));
    const unmatchedRelated = related.filter((r) => !files.some((f) => fileMatchesRelated(f, r)));
    if (unmatchedDiff.length && unmatchedRelated.length) {
      checks.push({
        name: 'Related files',
        status: 'warn',
        detail: `${unmatchedDiff.length} changed not listed; ${unmatchedRelated.length} listed not in diff`,
      });
    } else if (unmatchedDiff.length) {
      checks.push({
        name: 'Related files',
        status: 'warn',
        detail: `Changed but not listed: ${unmatchedDiff.slice(0, 3).join(', ')}${unmatchedDiff.length > 3 ? '…' : ''}`,
      });
    } else if (unmatchedRelated.length) {
      checks.push({
        name: 'Related files',
        status: 'warn',
        detail: `Listed but not in diff: ${unmatchedRelated.slice(0, 3).join(', ')}`,
      });
    } else {
      checks.push({ name: 'Related files', status: 'pass', detail: 'Diff matches listed paths' });
    }
  } else if (files.length && !related.length) {
    checks.push({
      name: 'Related files',
      status: 'warn',
      detail: 'No related files on CR — add paths from diff below',
    });
  }

  const declaredAreas = parseAppAreas(change.app_areas);
  const inferredAreas = inferAreasFromPaths(files);
  if (files.length && declaredAreas.length) {
    if (areasOverlap(declaredAreas, inferredAreas)) {
      checks.push({
        name: 'App areas',
        status: 'pass',
        detail: declaredAreas.join(', '),
      });
    } else {
      checks.push({
        name: 'App areas',
        status: 'warn',
        detail: `CR says ${declaredAreas.join(', ')}; diff looks like ${inferredAreas.join(', ') || 'other'}`,
      });
    }
  }

  const scope = parseOutOfScopeFlags(change.out_of_scope);
  const hasMigration = files.some((f) => MIGRATION_PATH_RE.test(f));
  const hasPlaid = files.some((f) => PLAID_PATH_RE.test(f));

  if (change.data_migration === 'none' && hasMigration) {
    checks.push({
      name: 'Data migration flag',
      status: 'gap',
      detail: 'Migration files in diff but CR says data_migration: none',
    });
  } else if (change.data_migration !== 'none' && !hasMigration && files.some((f) => /src\/lib|src\/app\/api/i.test(f))) {
    checks.push({
      name: 'Data migration flag',
      status: 'warn',
      detail: 'CR expects migration but no supabase/migrations/ in diff',
    });
  } else {
    checks.push({
      name: 'Data migration flag',
      status: 'pass',
      detail: change.data_migration,
    });
  }

  if (scope.noPlaid && hasPlaid) {
    checks.push({
      name: 'Out of scope',
      status: 'gap',
      detail: 'Plaid/Tech Spend paths in diff but out of scope says no Plaid',
    });
  } else if (scope.noMigrations && hasMigration) {
    checks.push({
      name: 'Out of scope',
      status: 'gap',
      detail: 'Migrations in diff but out of scope excludes them',
    });
  } else {
    checks.push({
      name: 'Out of scope',
      status: 'pass',
      detail: change.out_of_scope.trim() ? 'No conflicts detected' : 'Not specified',
    });
  }

  const maxBlast = reviews.reduce<'local' | 'feature' | 'cross_cutting'>(
    (max, r) => {
      const order = { local: 0, feature: 1, cross_cutting: 2 };
      return order[r.blast_radius] > order[max] ? r.blast_radius : max;
    },
    'local',
  );
  if (files.length > 15 && maxBlast === 'local') {
    checks.push({
      name: 'Blast radius',
      status: 'warn',
      detail: `${files.length} files changed; reviews marked blast radius local`,
    });
  } else if (files.length) {
    checks.push({
      name: 'Blast radius',
      status: 'pass',
      detail: `${files.length} file(s); review radius ${maxBlast}`,
    });
  }

  if (!change.acceptance_criteria.trim() && files.length) {
    checks.push({
      name: 'Acceptance criteria',
      status: 'warn',
      detail: 'No acceptance criteria — add testable checks',
    });
  } else if (change.acceptance_criteria.trim()) {
    checks.push({
      name: 'Acceptance criteria',
      status: 'pass',
      detail: 'Documented (manual QA still required)',
    });
  }

  const verdict = computeVerdict(checks);
  return {
    verdict,
    checks,
    summary: formatSummaryMarkdown(change, verdict, checks, git),
    git,
    suggestedRelatedFiles,
  };
}

export const VERIFICATION_VERDICT_LABEL: Record<VerificationVerdict, string> = {
  aligned: 'Aligned',
  minor_gaps: 'Minor gaps',
  blocked: 'Blocked',
};
