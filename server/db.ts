import pg from 'pg'
import { attachDatabasePool } from '@vercel/functions'

/**
 * Storage model: every entity (issue, sprint, comment…) is one row keyed by
 * (workspace, collection, id) holding the JSON record. A per-workspace sequence
 * stamps each write with a monotonically increasing `version`, so clients can
 * pull "everything since version N". Deletes are soft (the data is kept), so
 * nothing written to the cloud is ever destroyed by the app.
 */

export const WORKSPACE_ID = process.env.WORKSPACE_ID || 'skatebored'

function need(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

let _pool: pg.Pool | null = null
/** One pool per function instance (pooled Neon URL), shared across requests on Fluid compute. */
export function pool() {
  if (!_pool) {
    _pool = new pg.Pool({ connectionString: need('DATABASE_URL'), max: 5, idleTimeoutMillis: 10_000 })
    attachDatabasePool(_pool)
  }
  return _pool
}

let schema: Promise<void> | null = null
/**
 * Idempotent schema setup, run lazily on first request so deploys need no manual step.
 * DDL goes over the direct (unpooled) connection, as Neon recommends.
 */
export function ensureSchema() {
  schema ??= (async () => {
    const direct = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || need('DATABASE_URL') })
    await direct.connect()
    try {
      await direct.query(`
        create table if not exists sb_workspaces (
          id text primary key,
          seq bigint not null default 0,
          created_at timestamptz not null default now()
        );
        create table if not exists sb_records (
          workspace_id text not null references sb_workspaces(id),
          collection text not null,
          id text not null,
          data jsonb,
          deleted boolean not null default false,
          version bigint not null,
          updated_at timestamptz not null default now(),
          updated_by text,
          primary key (workspace_id, collection, id)
        );
        create index if not exists sb_records_version on sb_records (workspace_id, version);
        create index if not exists sb_records_issue_key on sb_records (workspace_id, (data->>'key')) where collection = 'issues';
      `)
      await direct.query('insert into sb_workspaces (id) values ($1) on conflict (id) do nothing', [WORKSPACE_ID])
    } finally {
      await direct.end()
    }
  })().catch((e) => {
    schema = null
    throw e
  })
  return schema
}
