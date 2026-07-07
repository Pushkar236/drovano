import { Button } from '@drovano/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState, type ChangeEvent } from 'react';

import { fetchDefinitions } from '../data/crm.js';
import { queryClient } from '../data/workspaces.js';
import { parseCsv, type ParsedCsv } from '../lib/csv.js';
import { trpc } from '../lib/trpc.js';

const BATCH_SIZE = 200;
const SKIP_COLUMN = '__skip__';

interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { index: number; message: string }[];
}

function emptySummary(): ImportSummary {
  return { created: 0, updated: 0, skipped: 0, errors: [] };
}

/**
 * CSV import (TASK-0028): parse locally, map columns to attributes,
 * dry-run first (validate + classify, write nothing), then import in
 * batches through the same rules as manual entry.
 */
export function ImportPage() {
  const { objectKey } = useParams({ from: '/app/o/$objectKey/import' });
  const definitions = useQuery(
    { queryKey: ['crm-definitions'], queryFn: fetchDefinitions },
    queryClient,
  );
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dedupeKey, setDedupeKey] = useState('');
  const [dedupeMode, setDedupeMode] = useState<'skip' | 'update'>('skip');
  const [phase, setPhase] = useState<'configure' | 'running' | 'done'>('configure');
  const [dryRunSummary, setDryRunSummary] = useState<ImportSummary | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const object = definitions.data?.objects.find((candidate) => candidate.key === objectKey);
  const attributes =
    definitions.data?.attributes.filter(
      (attribute) => attribute.objectId === object?.id && !attribute.archived,
    ) ?? [];

  const onFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setFileName(file.name);
    setError(undefined);
    setDryRunSummary(null);
    setSummary(null);
    void file.text().then((text) => {
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError('That file has no data rows.');
        setCsv(null);
        return;
      }
      setCsv(parsed);
      // Default mapping: header name matches an attribute key.
      const keys = new Set(attributes.map((attribute) => attribute.key));
      setMapping(
        Object.fromEntries(
          parsed.headers.map((header) => {
            const normalized = header.trim().toLowerCase().replace(/\s+/g, '_');
            return [header, keys.has(normalized) ? normalized : SKIP_COLUMN];
          }),
        ),
      );
    });
  };

  const buildRows = (): Record<string, string>[] => {
    if (csv === null) return [];
    return csv.rows.map((cells) => {
      const row: Record<string, string> = {};
      csv.headers.forEach((header, columnIndex) => {
        const attributeKey = mapping[header];
        const value = cells[columnIndex]?.trim() ?? '';
        if (attributeKey !== undefined && attributeKey !== SKIP_COLUMN && value !== '') {
          row[attributeKey] = value;
        }
      });
      return row;
    });
  };

  const run = (dryRun: boolean): void => {
    if (object === undefined) return;
    setPhase('running');
    setError(undefined);
    const rows = buildRows();
    const total = emptySummary();
    const dedupe = dedupeKey !== '' ? { attributeKey: dedupeKey, mode: dedupeMode } : undefined;

    void (async () => {
      try {
        for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
          const batch = rows.slice(offset, offset + BATCH_SIZE);
          const result = await trpc.crm.records.import.mutate({
            objectId: object.id,
            rows: batch,
            ...(dedupe !== undefined ? { dedupe } : {}),
            dryRun,
          });
          total.created += result.created;
          total.updated += result.updated;
          total.skipped += result.skipped;
          total.errors.push(
            ...result.errors.map((rowError) => ({
              index: rowError.index + offset,
              message: rowError.message,
            })),
          );
        }
        if (dryRun) {
          setDryRunSummary(total);
          setPhase('configure');
        } else {
          setSummary(total);
          setPhase('done');
          await queryClient.invalidateQueries({ queryKey: ['records', object.id] });
        }
      } catch (mutationError: unknown) {
        setPhase('configure');
        setError(
          mutationError instanceof Error && mutationError.message !== ''
            ? mutationError.message
            : 'The import failed. Nothing from the failing batch was written.',
        );
      }
    })();
  };

  if (definitions.isPending) return <div className="p-8" aria-busy="true" />;
  if (object === undefined) {
    return (
      <div className="p-8">
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
          Import
        </h1>
        <p className="mt-3 text-base text-text-secondary">There is no “{objectKey}” object.</p>
      </div>
    );
  }

  const renderSummary = (label: string, data: ImportSummary) => (
    <div className="mt-4 rounded-lg border border-border-hairline p-4">
      <h2 className="text-md font-medium text-text-primary">{label}</h2>
      <p className="mt-1 text-base text-text-secondary">
        {data.created} created · {data.updated} updated · {data.skipped} skipped ·{' '}
        {data.errors.length} error{data.errors.length === 1 ? '' : 's'}
      </p>
      {data.errors.length > 0 && (
        <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
          {data.errors.slice(0, 50).map((rowError) => (
            <li key={rowError.index} className="text-sm text-status-danger-text">
              Row {rowError.index + 2}: {rowError.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
        Import {object.name.toLowerCase()} records
      </h1>
      <p className="mt-1 text-base text-text-secondary">
        Upload a CSV, map its columns, dry-run to see what would happen, then import.{' '}
        <Link
          to="/o/$objectKey"
          params={{ objectKey }}
          className="text-text-accent underline-offset-2 hover:underline"
        >
          Back to records
        </Link>
      </p>

      <label className="mt-6 block">
        <span className="text-sm font-medium text-text-primary">CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="mt-1 block text-base text-text-secondary file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface-raised file:px-3 file:py-1 file:text-text-primary"
        />
      </label>
      {error !== undefined && (
        <p role="alert" className="mt-3 text-base text-status-danger-text">
          {error}
        </p>
      )}

      {csv !== null && (
        <>
          <h2 className="mt-6 text-md font-medium text-text-primary">
            Map columns{' '}
            <span className="text-text-muted">
              ({fileName}, {csv.rows.length} rows)
            </span>
          </h2>
          <table className="mt-2 w-full">
            <thead>
              <tr className="border-b border-border-hairline text-left">
                <th className="py-1 text-sm font-medium text-text-secondary">CSV column</th>
                <th className="py-1 text-sm font-medium text-text-secondary">Attribute</th>
              </tr>
            </thead>
            <tbody>
              {csv.headers.map((header) => (
                <tr key={header} className="border-b border-border-hairline">
                  <td className="py-1 text-base text-text-primary">{header}</td>
                  <td className="py-1">
                    <select
                      aria-label={`Map ${header}`}
                      value={mapping[header] ?? SKIP_COLUMN}
                      onChange={(event) => {
                        setMapping({ ...mapping, [header]: event.target.value });
                      }}
                      className="min-h-8 rounded-md border border-border-strong bg-surface-raised px-2 text-base text-text-primary"
                    >
                      <option value={SKIP_COLUMN}>— skip —</option>
                      {attributes.map((attribute) => (
                        <option key={attribute.id} value={attribute.key}>
                          {attribute.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">Dedupe by</span>
              <select
                value={dedupeKey}
                onChange={(event) => {
                  setDedupeKey(event.target.value);
                }}
                className="min-h-8 rounded-md border border-border-strong bg-surface-raised px-2 text-base text-text-primary"
              >
                <option value="">— none —</option>
                {attributes
                  .filter((attribute) =>
                    ['text', 'url', 'email', 'phone', 'select'].includes(attribute.type),
                  )
                  .map((attribute) => (
                    <option key={attribute.id} value={attribute.key}>
                      {attribute.name}
                    </option>
                  ))}
              </select>
            </label>
            {dedupeKey !== '' && (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-primary">On match</span>
                <select
                  value={dedupeMode}
                  onChange={(event) => {
                    setDedupeMode(event.target.value as 'skip' | 'update');
                  }}
                  className="min-h-8 rounded-md border border-border-strong bg-surface-raised px-2 text-base text-text-primary"
                >
                  <option value="skip">Skip the row</option>
                  <option value="update">Update the record</option>
                </select>
              </label>
            )}
            <Button
              variant="secondary"
              loading={phase === 'running'}
              onClick={() => {
                run(true);
              }}
            >
              Dry run
            </Button>
            <Button
              variant="primary"
              loading={phase === 'running'}
              disabled={phase === 'done'}
              onClick={() => {
                run(false);
              }}
            >
              Import {csv.rows.length} rows
            </Button>
          </div>

          {dryRunSummary !== null && renderSummary('Dry run — nothing written', dryRunSummary)}
          {summary !== null && renderSummary('Import complete', summary)}
        </>
      )}
    </div>
  );
}
