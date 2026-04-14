import { createHash, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { jwtVerify, SignJWT } from "jose";
import type { Repo } from "./repo.js";

const TOKEN_HEADER = "authorization";

export function getBearerToken(req: Request) {
  const raw = req.headers[TOKEN_HEADER];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function getRequiredEnv(name: string, fallback?: string) {
  const v = (process.env[name] || "").trim();
  if (v) return v;
  if (fallback !== undefined) {
    // eslint-disable-next-line no-console
    console.warn(`${name} is not set; using fallback (development only)`);
    return fallback;
  }
  throw new Error(`${name} is not set`);
}

const ACCESS_SECRET = () => getRequiredEnv("JWT_ACCESS_SECRET", "dev_access_secret_change_me");

function secretKeyFromString(s: string) {
  return new TextEncoder().encode(s);
}

export async function issueAccessToken(user: { id: string; email: string }, opts?: { ttlMin?: number }) {
  const ttlMin = Number(process.env.JWT_ACCESS_TTL_MIN || opts?.ttlMin || 15);
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ sub: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + Math.max(1, ttlMin) * 60)
    .sign(secretKeyFromString(ACCESS_SECRET()));
}

export function sha256Hex(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export async function requireAuth(repo: Repo, req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const verified = await jwtVerify(token, secretKeyFromString(ACCESS_SECRET()));
    const userId = String(verified.payload.sub || "");
    const email = String((verified.payload as any).email || "");
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    // Ensure user still exists.
    const u = await repo.getUserById(userId);
    if (!u) return res.status(401).json({ error: "Unauthorized" });
    req.user = { id: u.id, email: u.email || email };
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function hashPassword(password: string, salt: string) {
  const buf = scryptSync(password, salt, 32);
  return buf.toString("hex");
}

export function verifyPassword(password: string, salt: string, expectedHex: string) {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

