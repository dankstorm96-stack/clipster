import { NextResponse } from "next/server";
import { hashPassword, startSession } from "@/lib/auth";
import { pool, ready } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await ready();
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== "string" || password.length < 8)
    return NextResponse.json({ error: "Valid email and a password of 8+ characters required" }, { status: 400 });
  try {
    const { rows } = await pool.query("insert into users (email,password_hash) values ($1,$2) returning id", [
      email.toLowerCase(), hashPassword(password),
    ]);
    await startSession(rows[0].id);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    throw e;
  }
}
