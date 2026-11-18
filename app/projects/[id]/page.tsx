"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";

type Clip = { id: string; title: string; reason: string; score: number; start_s: number; end_s: number; file_path: string };
type Project = { title: string; status: string; stage: string | null; error: string | null; clips: Clip[] };

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [p, setP] = useState<Project | null>(null);

  useEffect(() => {
    let stop = false;
    async function tick() {
      const r = await fetch(`/api/projects/${id}`);
      if (r.ok && !stop) {
        const j = (await r.json()) as Project;
        setP(j);
        if (j.status === "processing" || j.status === "queued") setTimeout(tick, 2000);
      }
    }
    tick();
    return () => { stop = true; };
  }, [id]);

  if (!p) return <main className="p-12">Loading…</main>;
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-neutral-500">← Projects</Link>
      <h1 className="mt-2 text-2xl font-bold">{p.title}</h1>
      {p.status === "failed" && <p className="mt-4 text-red-600">Failed: {p.error}</p>}
      {p.status !== "done" && p.status !== "failed" && <p className="mt-4 text-neutral-500">{p.stage ?? "Queued"}…</p>}
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {p.clips.map((c) => (
          <div key={c.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <video src={`/api/files/${c.file_path}`} controls className="aspect-[9/16] w-full rounded-lg bg-black" />
            <div className="mt-3 flex items-start justify-between gap-2">
              <h2 className="font-semibold">{c.title}</h2>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">{c.score}</span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{c.reason}</p>
            <a href={`/api/files/${c.file_path}`} download className="mt-3 inline-block text-sm underline">Download</a>
          </div>
        ))}
      </div>
    </main>
  );
}
