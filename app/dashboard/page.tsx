"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type P = { id: string; title: string; status: string; stage: string | null; created_at: string };

export default function Dashboard() {
  const [projects, setProjects] = useState<P[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [url, setUrl] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    const r = await fetch("/api/projects");
    if (r.status === 401) return router.replace("/login");
    if (r.ok) setProjects(await r.json());
  }, [router]);
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

  async function importUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
    });
    if (r.ok) setUrl(""); else setErr((await r.json()).error ?? "Import failed");
    setBusy(false); load();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button onClick={logout} className="ml-auto mr-4 text-sm text-neutral-500 underline">Log out</button>
        <label className="shrink-0 cursor-pointer rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
          {busy ? "Uploading…" : "Upload video"}
          <input type="file" accept="video/*" className="hidden" onChange={upload} disabled={busy} />
        </label>
      </div>
      <form onSubmit={importUrl} className="mt-6 flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="Or paste a video link (https://…)"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700" />
        <button disabled={busy || !url} className="shrink-0 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700">
          Get clips
        </button>
      </form>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <ul className="mt-8 divide-y divide-neutral-200 dark:divide-neutral-800">
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-4 py-4 hover:opacity-70">
              <span className="min-w-0 truncate font-medium">{p.title}</span>
              <span className="shrink-0 text-sm text-neutral-500">{p.status === "done" ? "Ready" : p.status === "failed" ? "Failed" : p.stage ?? "Queued"}</span>
            </Link>
          </li>
        ))}
        {projects.length === 0 && <li className="py-8 text-neutral-500">No projects yet. Upload a video to begin.</li>}
      </ul>
    </main>
  );
}
