import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const TOKEN_HEADER = "authorization";

// In-memory tokens (dev-friendly). Restarting backend logs everyone out.
const validTokens = new Set<string>();

export function issueToken() {
  const token = randomUUID();
  validTokens.add(token);
  return token;
}

export function revokeToken(token: string) {
  validTokens.delete(token);
}

export function revokeAllTokens() {
  validTokens.clear();
}

export function getBearerToken(req: Request) {
  const raw = req.headers[TOKEN_HEADER];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token || !validTokens.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
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

