import crypto from "node:crypto";
import { cookies } from "next/headers";
import { pool, ready } from "./db";

const COOKIE = "cf_session";
const TTL_DAYS = 30;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString("hex")}:${h.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, "hex"), 64);
  const expected = Buffer.from(hash, "hex");
  return h.length === expected.length && crypto.timingSafeEqual(h, expected);
}

export async function startSession(userId: string) {
  await ready();
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TTL_DAYS * 864e5);
  await pool.query("insert into sessions (token_hash,user_id,expires_at) values ($1,$2,$3)", [sha(token), userId, expires]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await pool.query("delete from sessions where token_hash=$1", [sha(t)]);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<{ id: string; email: string } | null> {
  await ready();
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const { rows } = await pool.query(
    "select u.id,u.email from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()",
    [sha(t)],
  );
  return rows[0] ?? null;
}
