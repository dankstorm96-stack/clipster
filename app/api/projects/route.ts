import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { pool, ready } from "@/lib/db";
import { DATA_DIR, processProject } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ready();
  const { rows } = await pool.query("select id,title,status,stage,duration,created_at from projects order by created_at desc");
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  await ready();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("video/"))
    return NextResponse.json({ error: "Upload a video file" }, { status: 400 });
  const { rows } = await pool.query(
    "insert into projects (title, source_path) values ($1, '') returning id",
    [(form.get("title") as string) || file.name],
  );
  const id = rows[0].id as string;
  const dir = path.join(DATA_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  const src = path.join(dir, "source" + (path.extname(file.name) || ".mp4"));
  await fs.writeFile(src, Buffer.from(await file.arrayBuffer()));
  await pool.query("update projects set source_path=$2 where id=$1", [id, src]);
  void processProject(id); // in-process worker; swap for a real queue in production
  return NextResponse.json({ id }, { status: 201 });
}
