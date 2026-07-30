import type { SupabaseClient } from '@supabase/supabase-js';
import { HANK_DB_SCHEMA_HINTS } from '@/lib/hank/db-schema-hints';

export const HANK_DB_ACCESS_PROMPT = `
## Database access
You have read-only tools to query live Supabase data: list_tables, describe_table, query_database.
Use them whenever the user asks about counts, discrepancies, who has what, pipeline status, or anything requiring live numbers.
Do not guess counts — query first, then explain.

Workflow:
1. list_tables or describe_table if you need column names
2. query_database with a focused SELECT (joins OK; max 500 rows returned)
3. Summarize findings clearly with specific numbers and likely causes

${HANK_DB_SCHEMA_HINTS}
`.trim();

const DISALLOWED_SQL =
  /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|execute|call|do|set|begin|commit|rollback|into|pg_sleep|pg_read_file|lo_import|lo_export)\b/i;

export function validateReadOnlySql(sql: string): string {
  let normalized = sql.trim();
  if (!normalized) throw new Error('Query is empty');
  if (normalized.endsWith(';')) normalized = normalized.slice(0, -1).trim();
  if (!/^\s*select/i.test(normalized)) throw new Error('Only SELECT queries are allowed');
  if (DISALLOWED_SQL.test(normalized)) throw new Error('Query contains disallowed keywords');
  if (normalized.includes(';')) throw new Error('Multiple statements are not allowed');
  return normalized;
}

function truncateJson(value: unknown, maxChars = 12000): string {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… (truncated, ${text.length} chars total)`;
}

export async function hankListTables(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.rpc('hank_admin_list_tables');
  if (error) throw new Error(error.message);
  return truncateJson(data ?? []);
}

export async function hankDescribeTable(admin: SupabaseClient, tableName: string): Promise<string> {
  const { data, error } = await admin.rpc('hank_admin_describe_table', {
    table_name: tableName,
  });
  if (error) throw new Error(error.message);
  return truncateJson(data ?? []);
}

export async function hankQueryDatabase(admin: SupabaseClient, sql: string): Promise<string> {
  const normalized = validateReadOnlySql(sql);
  const { data, error } = await admin.rpc('hank_admin_read_query', {
    query_text: normalized,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return truncateJson({
    rowCount: rows.length,
    rows,
  });
}

export const HANK_DB_TOOLS = [
  {
    name: 'list_tables',
    description:
      'List all public database tables with column counts. Use before querying unfamiliar data.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'describe_table',
    description: 'List columns and types for a public table.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'Table name in the public schema, e.g. customers or checkcommerce_commissions',
        },
      },
      required: ['table_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'query_database',
    description:
      'Run a read-only SELECT query against the live database. Returns up to 500 rows. Use for counts, joins, and investigative questions.',
    input_schema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'A single SELECT statement (no semicolons). Example: SELECT count(*) FROM customers WHERE status = \'active\'',
        },
      },
      required: ['sql'],
      additionalProperties: false,
    },
  },
] as const;

export function createHankDbToolRunner(admin: SupabaseClient) {
  return async (name: string, input: Record<string, unknown>): Promise<string> => {
    try {
      if (name === 'list_tables') return await hankListTables(admin);
      if (name === 'describe_table') {
        const tableName = String(input.table_name ?? '').trim();
        if (!tableName) return 'Error: table_name is required';
        return await hankDescribeTable(admin, tableName);
      }
      if (name === 'query_database') {
        const sql = String(input.sql ?? '').trim();
        if (!sql) return 'Error: sql is required';
        return await hankQueryDatabase(admin, sql);
      }
      return `Error: unknown tool ${name}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Query failed';
      if (/function.*does not exist/i.test(message)) {
        return 'Error: Database query functions are not installed. Apply migration 0081_hank_read_query.sql to Supabase.';
      }
      return `Error: ${message}`;
    }
  };
}
