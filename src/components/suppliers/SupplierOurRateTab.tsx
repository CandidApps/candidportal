'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SolutionProviderRecord } from '@/lib/solution-providers';
import { showOurRateTab } from '@/lib/provider-categories';
import type { RateTemplateRecord } from '@/lib/rate-template-types';
import {
  createProviderRateTemplate,
  deleteProviderRateTemplate,
  fetchProviderRateTemplates,
  saveProviderRateTemplate,
} from '@/lib/rate-templates';
import { fetchProviderScheduleA } from '@/lib/schedule-a';
import { newScheduleALine, normalizeScheduleASection, type ScheduleARateLine } from '@/lib/schedule-a-types';
import { SupplierRateLinesTable } from '@/components/suppliers/SupplierRateLinesTable';

function cloneLinesFromScheduleA(lines: ScheduleARateLine[]): ScheduleARateLine[] {
  return lines.map((line) =>
    newScheduleALine({
      section: normalizeScheduleASection(line.section),
      item: line.item,
      buyRate: line.buyRate,
      revenueShare: line.revenueShare,
      notes: line.notes,
    }),
  );
}

function nextTemplateName(templates: RateTemplateRecord[]): string {
  const base = 'New template';
  if (!templates.some((t) => t.name === base)) return base;
  let n = 2;
  while (templates.some((t) => t.name === `${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function SupplierOurRateTab({ provider }: { provider: SolutionProviderRecord }) {
  const [templates, setTemplates] = useState<RateTemplateRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [lines, setLines] = useState<ScheduleARateLine[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [importFromScheduleA, setImportFromScheduleA] = useState(false);
  const [scheduleALineCount, setScheduleALineCount] = useState(0);
  const [dirty, setDirty] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  const loadTemplateIntoEditor = useCallback((template: RateTemplateRecord | null) => {
    setLines(template?.lines ?? []);
    setTemplateName(template?.name ?? '');
    setDirty(false);
    if (template?.importedFromScheduleAAt) {
      setNote('This template was last imported from Schedule A — review and save any changes.');
    } else {
      setNote('');
    }
  }, []);

  const reload = useCallback(async () => {
    if (!provider.dbId || provider.fromBmwOnly) {
      setTemplates([]);
      setLines([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [loadedTemplates, scheduleA] = await Promise.all([
        fetchProviderRateTemplates(provider.id),
        fetchProviderScheduleA(provider.id),
      ]);
      setTemplates(loadedTemplates);
      setScheduleALineCount(scheduleA?.lines?.length ?? 0);

      const preferred =
        loadedTemplates.find((t) => t.id === selectedTemplateId) ??
        loadedTemplates.find((t) => t.isDefault) ??
        loadedTemplates[0] ??
        null;

      if (preferred) {
        setSelectedTemplateId(preferred.id);
        loadTemplateIntoEditor(preferred);
      } else {
        setSelectedTemplateId('');
        loadTemplateIntoEditor(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rate templates');
    } finally {
      setLoading(false);
    }
  }, [provider.dbId, provider.fromBmwOnly, provider.id, selectedTemplateId, loadTemplateIntoEditor]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when provider changes only
  }, [provider.id, provider.dbId]);

  if (!showOurRateTab(provider)) {
    return (
      <p style={{ fontSize: 13, color: 'var(--gray)' }}>
        Enable <strong>Include rates in customer analysis</strong> and set provider type to{' '}
        <strong>Merchant Services</strong> to manage Candid rates for savings analysis.
      </p>
    );
  }

  if (provider.fromBmwOnly || !provider.dbId) {
    return (
      <p style={{ fontSize: 13, color: 'var(--gray)' }}>
        Save this vendor to the database before editing our rates.
      </p>
    );
  }

  const updateLine = (id: string, patch: Partial<ScheduleARateLine>) => {
    setDirty(true);
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const removeLine = (id: string) => {
    setDirty(true);
    setLines((prev) => prev.filter((line) => line.id !== id));
  };

  const handleTemplateSelect = (templateId: string) => {
    if (templateId === selectedTemplateId) return;
    const next = templates.find((t) => t.id === templateId) ?? null;
    setSelectedTemplateId(templateId);
    loadTemplateIntoEditor(next);
    setImportFromScheduleA(false);
  };

  const handleImportToggle = async (checked: boolean) => {
    setImportFromScheduleA(checked);
    if (!checked) return;

    setError('');
    try {
      const scheduleA = await fetchProviderScheduleA(provider.id);
      if (!scheduleA?.lines?.length) {
        setError('No Schedule A rates on file. Upload Schedule A first or enter rates manually.');
        setImportFromScheduleA(false);
        return;
      }
      setDirty(true);
      setLines(cloneLinesFromScheduleA(scheduleA.lines));
      setNote(`Imported ${scheduleA.lines.length} line${scheduleA.lines.length === 1 ? '' : 's'} from Schedule A. Edit as needed, then save.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setImportFromScheduleA(false);
    }
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setError('');
    try {
      const saved = await saveProviderRateTemplate({
        templateId: selectedTemplate.id,
        name: templateName.trim() || selectedTemplate.name,
        lines,
        importedFromScheduleA: importFromScheduleA,
      });
      setTemplates((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      setLines(saved.lines);
      setTemplateName(saved.name);
      setImportFromScheduleA(false);
      setDirty(false);
      setNote('Template saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsNew = async () => {
    const name = window.prompt('Name for this rate template', nextTemplateName(templates));
    if (!name?.trim()) return;
    setSaving(true);
    setError('');
    try {
      const created = await createProviderRateTemplate({
        providerId: provider.id,
        name: name.trim(),
        lines,
        importedFromScheduleA: importFromScheduleA,
      });
      const refreshed = await fetchProviderRateTemplates(provider.id);
      setTemplates(refreshed);
      setSelectedTemplateId(created.id);
      loadTemplateIntoEditor(created);
      setImportFromScheduleA(false);
      setDirty(false);
      setNote(`Saved as new template "${created.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save as new failed');
    } finally {
      setSaving(false);
    }
  };

  const handleNewTemplate = async () => {
    const name = window.prompt('Name for new rate template', nextTemplateName(templates));
    if (!name?.trim()) return;
    setSaving(true);
    setError('');
    try {
      const created = await createProviderRateTemplate({
        providerId: provider.id,
        name: name.trim(),
        lines: [],
      });
      const refreshed = await fetchProviderRateTemplates(provider.id);
      setTemplates(refreshed);
      setSelectedTemplateId(created.id);
      loadTemplateIntoEditor(created);
      setNote(`Created template "${created.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const handleMakeDefault = async () => {
    if (!selectedTemplate || selectedTemplate.isDefault) return;
    setSaving(true);
    setError('');
    try {
      const saved = await saveProviderRateTemplate({
        templateId: selectedTemplate.id,
        isDefault: true,
        lines: selectedTemplate.lines,
      });
      const refreshed = await fetchProviderRateTemplates(provider.id);
      setTemplates(refreshed);
      setSelectedTemplateId(saved.id);
      setNote(`"${saved.name}" is now the default template for analysis reviews.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    if (!window.confirm(`Delete template "${selectedTemplate.name}"? This cannot be undone.`)) return;
    setSaving(true);
    setError('');
    try {
      await deleteProviderRateTemplate(selectedTemplate.id);
      const refreshed = await fetchProviderRateTemplates(provider.id);
      setTemplates(refreshed);
      const next = refreshed.find((t) => t.isDefault) ?? refreshed[0] ?? null;
      setSelectedTemplateId(next?.id ?? '');
      loadTemplateIntoEditor(next);
      setNote(next ? `Now editing "${next.name}".` : 'No templates remain — create one to get started.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Our rate templates</div>
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
            Save multiple sell-rate schedules per partner. The default template loads first in analysis reviews.
          </div>
        </div>
      </div>

      <div className="rate-template-toolbar">
        <label className="rate-template-field">
          <span>Template</span>
          <select
            value={selectedTemplateId}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            disabled={!templates.length}
          >
            {templates.length === 0 ? <option value="">No templates yet</option> : null}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="rate-template-field">
          <span>Template name</span>
          <input
            type="text"
            value={templateName}
            onChange={(e) => {
              setTemplateName(e.target.value);
              setDirty(true);
            }}
            disabled={!selectedTemplate}
            placeholder="e.g. Standard IC+, Aggressive flat"
          />
        </label>
        <div className="rate-template-actions">
          <button type="button" className="btn-secondary" style={{ fontSize: 12 }} disabled={saving} onClick={() => void handleNewTemplate()}>
            + New template
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 12 }}
            disabled={saving || !selectedTemplate}
            onClick={() => void handleMakeDefault()}
          >
            {selectedTemplate?.isDefault ? 'Default template' : 'Make default'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 12 }}
            disabled={saving || !selectedTemplate || templates.length <= 1}
            onClick={() => void handleDelete()}
          >
            Delete
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 12 }}
            disabled={saving || !selectedTemplate}
            onClick={() => void handleSaveAsNew()}
          >
            Save as new
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ fontSize: 12 }}
            disabled={saving || !selectedTemplate}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : dirty ? 'Save template' : 'Save template'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ fontSize: 12 }}
          disabled={!selectedTemplate}
          onClick={() => {
            setDirty(true);
            setLines((prev) => [...prev, newScheduleALine()]);
          }}
        >
          + Add line
        </button>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          marginBottom: 16,
          cursor: scheduleALineCount > 0 ? 'pointer' : 'not-allowed',
          opacity: scheduleALineCount > 0 ? 1 : 0.65,
        }}
      >
        <input
          type="checkbox"
          checked={importFromScheduleA}
          disabled={scheduleALineCount === 0 || !selectedTemplate}
          onChange={(e) => void handleImportToggle(e.target.checked)}
        />
        Import rates from Schedule A into this template
        {scheduleALineCount === 0 && (
          <span style={{ fontSize: 11, color: 'var(--gray)' }}>(upload Schedule A first)</span>
        )}
      </label>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {note && <p style={{ color: 'var(--gray)', fontSize: 12, marginBottom: 12 }}>{note}</p>}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading rate templates…</p>
      ) : !selectedTemplate ? (
        <p style={{ fontSize: 13, color: 'var(--gray)' }}>
          No rate templates yet. Click <strong>New template</strong> to create your first schedule.
        </p>
      ) : (
        <SupplierRateLinesTable
          lines={lines}
          onUpdateLine={updateLine}
          onRemoveLine={removeLine}
          rateColumnLabel="Sell rate"
          emptyMessage="No rate lines in this template. Import from Schedule A or add lines manually."
        />
      )}
    </div>
  );
}
