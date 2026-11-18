import { Pool } from "pg";

// Bump when the schema below changes so a hot-reloaded dev server re-runs it.
const SCHEMA_VERSION = 2;
const g = globalThis as unknown as { pool?: Pool; ready?: Promise<void>; schemaVersion?: number };
export const pool =
  g.pool ?? (g.pool = new Pool({ connectionString: process.env.DATABASE_URL }));

export function ready(): Promise<void> {
  if (g.schemaVersion !== SCHEMA_VERSION) { g.ready = undefined; g.schemaVersion = SCHEMA_VERSION; }
  return (g.ready ??= pool
    .query(
      `create table if not exists users (
        id uuid primary key default gen_random_uuid(),
        email text unique not null,
        password_hash text not null,
        created_at timestamptz not null default now()
      );
      create table if not exists sessions (
        token_hash text primary key,
        user_id uuid not null references users(id) on delete cascade,
        expires_at timestamptz not null
      );
      create table if not exists projects (
        id uuid primary key default gen_random_uuid(),
        title text not null,
        source_path text not null,
        status text not null default 'queued',
        stage text,
        error text,
        duration real,
        created_at timestamptz not null default now()
      );
      alter table projects add column if not exists user_id uuid references users(id) on delete cascade;
      create table if not exists clips (
        id uuid primary key default gen_random_uuid(),
        project_id uuid not null references projects(id) on delete cascade,
        title text not null,
        reason text,
        score int not null,
        start_s real not null,
        end_s real not null,
        file_path text,
        created_at timestamptz not null default now()
      );`,
    )
    .then(() => undefined)
    .catch((e) => { g.ready = undefined; throw e; }));
}
