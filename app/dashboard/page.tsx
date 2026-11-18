"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type P = { id: string; title: string; status: string; stage: string | null; created_at: string };

export default function Dashboard() {
  const [projects, setProjects] = useState<P[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => setProjects(await (await fetch("/api/projects")).json()), []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    const i = setInterval(load, 3000);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/projects", { method: "POST", body: fd });
    if (!r.ok) setErr((await r.json()).error ?? "Upload failed");
    setBusy(false); load();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <label className="cursor-pointer rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
          {busy ? "Uploading…" : "Upload video"}
          <input type="file" accept="video/*" className="hidden" onChange={upload} disabled={busy} />
        </label>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <ul className="mt-8 divide-y divide-neutral-200 dark:divide-neutral-800">
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="flex items-center justify-between py-4 hover:opacity-70">
              <span className="font-medium">{p.title}</span>
              <span className="text-sm text-neutral-500">{p.status === "done" ? "Ready" : p.status === "failed" ? "Failed" : p.stage ?? "Queued"}</span>
            </Link>
          </li>
        ))}
        {projects.length === 0 && <li className="py-8 text-neutral-500">No projects yet. Upload a video to begin.</li>}
      </ul>
    </main>
  );
}
