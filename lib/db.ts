import { Pool } from "pg";

const g = globalThis as unknown as { pool?: Pool; ready?: Promise<void> };
export const pool =
  g.pool ?? (g.pool = new Pool({ connectionString: process.env.DATABASE_URL }));

export function ready(): Promise<void> {
  return (g.ready ??= pool
    .query(
      `create table if not exists projects (
        id uuid primary key default gen_random_uuid(),
        title text not null,
        source_path text not null,
        status text not null default 'queued',
        stage text,
        error text,
        duration real,
        created_at timestamptz not null default now()
      );
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
    .then(() => undefined));
}
