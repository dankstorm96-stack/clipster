import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { pool, ready } from "@/lib/db";
import { DATA_DIR, importFromUrl, processProject } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { rows } = await pool.query(
    "select id,title,status,stage,duration,created_at from projects where user_id=$1 order by created_at desc",
    [user.id],
  );
  return NextResponse.json(rows);
}

async function createProject(userId: string, title: string) {
  const { rows } = await pool.query(
    "insert into projects (title, source_path, user_id) values ($1, '', $2) returning id",
    [title.slice(0, 200), userId],
  );
  const id = rows[0].id as string;
  await fs.mkdir(path.join(DATA_DIR, id), { recursive: true });
  return id;
}

export async function POST(req: Request) {
  await ready();
  const user = await currentUser();
  if (!user) return unauthorized();

  // JSON body: import from a public video URL.
  if (req.headers.get("content-type")?.includes("application/json")) {
    const { url } = await req.json().catch(() => ({}));
    let u: URL;
    try { u = new URL(String(url)); } catch { return NextResponse.json({ error: "Enter a valid URL" }, { status: 400 }); }
    if (u.protocol !== "https:") return NextResponse.json({ error: "Only https:// URLs are supported" }, { status: 400 });
    const id = await createProject(user.id, u.toString());
    await pool.query("update projects set stage='Downloading' where id=$1", [id]);
    void importFromUrl(id, u.toString()).then((ok) => { if (ok) return processProject(id); });
    return NextResponse.json({ id }, { status: 201 });
  }

  // Multipart body: direct upload.
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("video/"))
    return NextResponse.json({ error: "Upload a video file" }, { status: 400 });
  const id = await createProject(user.id, (form.get("title") as string) || file.name);
  const src = path.join(DATA_DIR, id, "source" + (path.extname(file.name).replace(/[^.\w]/g, "") || ".mp4"));
  await fs.writeFile(src, Buffer.from(await file.arrayBuffer()));
  await pool.query("update projects set source_path=$2 where id=$1", [id, src]);
  void processProject(id); // in-process worker; swap for a real queue in production
  return NextResponse.json({ id }, { status: 201 });
}
