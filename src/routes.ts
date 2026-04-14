import type { Express } from "express";
import { z } from "zod";
import type { Repo } from "./repo.js";
import { hashPassword, issueAccessToken, sha256Hex, verifyPassword } from "./auth.js";
import { randomUUID } from "node:crypto";
import { sendMail } from "./mailer.js";
import { runEmailAutomationOnce } from "./automation.js";
import {
  productCreateSchema,
  productUpdateSchema,
  subscriptionCreateSchema,
  subscriptionUpdateSchema,
  rentRecordCreateSchema,
  rentRecordUpdateSchema,
  reminderCreateSchema,
  reminderUpdateSchema,
} from "./validate.js";
import { isBeforeToday, isWithinNextDays } from "./lib/time.js";

export function registerRoutes(app: Express, r: Repo) {

  // Auth: register
  app.post("/api/auth/register", async (req, res) => {
    const parsed = z.object({
      email: z.string().trim().email(),
      password: z.string().trim().min(6),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await r.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const salt = randomUUID();
    const hash = hashPassword(parsed.data.password.trim(), salt);
    const user = await r.createUser({ email, passwordSalt: salt, passwordHash: hash });

    const accessToken = await issueAccessToken({ id: user.id, email: user.email });
    const refreshToken = randomUUID();
    const refreshHash = sha256Hex(refreshToken);
    const days = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);
    const expiresAt = new Date(Date.now() + Math.max(1, days) * 86400_000).toISOString();
    await r.createRefreshToken({ userId: user.id, tokenHash: refreshHash, expiresAt });

    res.json({ accessToken, refreshToken });
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = z.object({
      email: z.string().trim().email(),
      password: z.string().trim().min(1),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid credentials" });

    const inputEmail = parsed.data.email.trim().toLowerCase();
    const inputPassword = parsed.data.password.trim();

    const user = await r.getUserByEmail(inputEmail);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = verifyPassword(inputPassword, user.passwordSalt, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const accessToken = await issueAccessToken({ id: user.id, email: user.email });
    const refreshToken = randomUUID();
    const refreshHash = sha256Hex(refreshToken);
    const days = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);
    const expiresAt = new Date(Date.now() + Math.max(1, days) * 86400_000).toISOString();
    await r.createRefreshToken({ userId: user.id, tokenHash: refreshHash, expiresAt });

    res.json({ accessToken, refreshToken });
  });

  // Auth: forgot password (send 6-digit code)
  app.post("/api/auth/forgot-password", async (req, res) => {
    const parsed = z.object({ email: z.string().trim().email() }).safeParse(req.body);
    if (!parsed.success) return res.status(200).json({ ok: true });
    const email = parsed.data.email.trim().toLowerCase();
    const user = await r.getUserByEmail(email);
    if (!user) return res.status(200).json({ ok: true });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = sha256Hex(code);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    await r.createPasswordResetCode({ userId: user.id, codeHash, expiresAt });

    await sendMail({
      to: user.email,
      subject: "WegoConnect password reset code",
      text: `Your WegoConnect password reset code is: ${code}\n\nThis code expires in 15 minutes.`,
      html: `<p>Your WegoConnect password reset code is:</p><p style="font-size:20px;font-weight:700;letter-spacing:2px;">${code}</p><p>This code expires in 15 minutes.</p>`,
    });

    return res.json({ ok: true });
  });

  // Auth: reset password (verify code)
  app.post("/api/auth/reset-password", async (req, res) => {
    const parsed = z.object({
      email: z.string().trim().email(),
      code: z.string().trim().min(6).max(6),
      newPassword: z.string().trim().min(6),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const email = parsed.data.email.trim().toLowerCase();
    const user = await r.getUserByEmail(email);
    if (!user) return res.status(400).json({ error: "Invalid code" });

    const ok = await r.consumePasswordResetCode({ userId: user.id, codeHash: sha256Hex(parsed.data.code) });
    if (!ok) return res.status(400).json({ error: "Invalid code" });

    const salt = randomUUID();
    const hash = hashPassword(parsed.data.newPassword.trim(), salt);
    await r.updateUserCredentials(user.id, { passwordSalt: salt, passwordHash: hash });
    await r.revokeAllRefreshTokensForUser(user.id);
    return res.json({ ok: true });
  });

  // Auth: refresh access token
  app.post("/api/auth/refresh", async (req, res) => {
    const parsed = z.object({ refreshToken: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const refreshHash = sha256Hex(parsed.data.refreshToken);
    const row = await r.getRefreshTokenByHash(refreshHash);
    if (!row) return res.status(401).json({ error: "Invalid refresh token" });
    if (row.revokedAt) return res.status(401).json({ error: "Invalid refresh token" });
    if (row.expiresAt <= new Date().toISOString()) return res.status(401).json({ error: "Invalid refresh token" });

    const user = await r.getUserById(row.userId);
    if (!user) return res.status(401).json({ error: "Invalid refresh token" });

    const accessToken = await issueAccessToken({ id: user.id, email: user.email });
    res.json({ accessToken });
  });

  // Auth: logout (revoke refresh token)
  app.post("/api/auth/logout", async (req, res) => {
    const parsed = z.object({ refreshToken: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    await r.revokeRefreshTokenByHash(sha256Hex(parsed.data.refreshToken));
    res.json({ ok: true });
  });

  // Legacy admin endpoints will be replaced by /api/me/credentials in a later step.

  // Me: update my login credentials (email/password)
  app.put("/api/me/credentials", async (req, res) => {
    const parsed = z.object({
      currentPassword: z.string().trim().min(1),
      newEmail: z.string().trim().email().optional(),
      newPassword: z.string().trim().min(6).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const userId = req.user!.id;
    const user = await r.getUserById(userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const ok = verifyPassword(parsed.data.currentPassword.trim(), user.passwordSalt, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid current password" });

    const patch: { email?: string; passwordSalt?: string; passwordHash?: string } = {};
    if (parsed.data.newEmail) patch.email = parsed.data.newEmail.trim().toLowerCase();
    if (parsed.data.newPassword) {
      const salt = randomUUID();
      const hash = hashPassword(parsed.data.newPassword.trim(), salt);
      patch.passwordSalt = salt;
      patch.passwordHash = hash;
    }

    const updated = await r.updateUserCredentials(userId, patch);
    if (!updated) return res.status(500).json({ error: "Failed to update credentials" });
    await r.revokeAllRefreshTokensForUser(userId);
    res.json({ ok: true });
  });

  app.post("/api/email/test", async (req, res) => {
    const parsed = z.object({
      to: z.string().trim().email(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid email" });

    await sendMail({
      to: parsed.data.to,
      subject: "wegomanage SMTP test",
      text: "SMTP is configured correctly.",
      html: "<p><strong>SMTP is configured correctly.</strong></p>",
    });
    res.json({ ok: true });
  });

  app.post("/api/automation/email/run", async (_req, res) => {
    const force = String((_req.query as any)?.force ?? "").toLowerCase() === "true";
    const result = await runEmailAutomationOnce(r, { force });
    res.json(result);
  });

  // Settings / config
  app.get("/api/config", async (_req, res) => {
    const usdToFrwRate = Number((await r.getSetting("usd_to_frw_rate")) ?? "1300");
    res.json({ usdToFrwRate });
  });

  app.get("/api/profile", async (_req, res) => {
    const [name, role, email, company, avatarUrl] = await Promise.all([
      r.getSetting("profile_name"),
      r.getSetting("profile_role"),
      r.getSetting("profile_email"),
      r.getSetting("profile_company"),
      r.getSetting("profile_avatar_url"),
    ]);
    res.json({
      name: name ?? "",
      role: role ?? "",
      email: email ?? "",
      company: company ?? "",
      avatarUrl: avatarUrl ?? "",
    });
  });

  app.put("/api/profile", async (req, res) => {
    const parsed = z.object({
      name: z.string().trim().min(1).max(80),
      role: z.string().trim().max(80).optional().default(""),
      email: z.string().trim().email().max(120),
      company: z.string().trim().min(1).max(120),
      avatarUrl: z.string().trim().url().optional().or(z.literal("")).default(""),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid profile" });

    const p = parsed.data;
    await Promise.all([
      r.setSetting("profile_name", p.name),
      r.setSetting("profile_role", p.role ?? ""),
      r.setSetting("profile_email", p.email),
      r.setSetting("profile_company", p.company),
      r.setSetting("profile_avatar_url", p.avatarUrl ?? ""),
    ]);
    res.json({ ok: true });
  });

  app.put("/api/settings/usd-to-frw-rate", async (req, res) => {
    const body = z.object({ rate: z.number().positive() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Invalid rate" });
    await r.setSetting("usd_to_frw_rate", String(body.data.rate));
    res.json({ ok: true });
  });

  // Products
  app.get("/api/products", async (req, res) => res.json(await r.listProducts(req.user!.id)));
  app.get("/api/products/:id", async (req, res) => {
    const item = await r.getProduct(req.user!.id, req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });
  app.post("/api/products", async (req, res) => {
    const parsed = productCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const created = await r.createProduct(req.user!.id, parsed.data);
    await r.addActivity(req.user!.id, { action: "created", recordType: "product", recordName: created.name });
    res.status(201).json(created);
  });
  app.put("/api/products/:id", async (req, res) => {
    const parsed = productUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const updated = await r.updateProduct(req.user!.id, req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    await r.addActivity(req.user!.id, { action: "updated", recordType: "product", recordName: updated.name });
    res.json(updated);
  });
  app.delete("/api/products/:id", async (req, res) => {
    const cur = await r.getProduct(req.user!.id, req.params.id);
    const ok = await r.deleteProduct(req.user!.id, req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    if (cur) await r.addActivity(req.user!.id, { action: "deleted", recordType: "product", recordName: cur.name });
    res.json({ ok: true });
  });

  // Subscriptions
  app.get("/api/subscriptions", async (req, res) => res.json(await r.listSubscriptions(req.user!.id)));
  app.get("/api/subscriptions/:id", async (req, res) => {
    const item = await r.getSubscription(req.user!.id, req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });
  app.post("/api/subscriptions", async (req, res) => {
    const parsed = subscriptionCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const created = await r.createSubscription(req.user!.id, parsed.data);
    await r.addActivity(req.user!.id, { action: "created", recordType: "subscription", recordName: created.name });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after create subscription", e));
    res.status(201).json(created);
  });
  app.put("/api/subscriptions/:id", async (req, res) => {
    const parsed = subscriptionUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const updated = await r.updateSubscription(req.user!.id, req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    await r.addActivity(req.user!.id, { action: "updated", recordType: "subscription", recordName: updated.name });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after update subscription", e));
    res.json(updated);
  });
  app.delete("/api/subscriptions/:id", async (req, res) => {
    const cur = await r.getSubscription(req.user!.id, req.params.id);
    const ok = await r.deleteSubscription(req.user!.id, req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    if (cur) await r.addActivity(req.user!.id, { action: "deleted", recordType: "subscription", recordName: cur.name });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after delete subscription", e));
    res.json({ ok: true });
  });

  // Rent records
  app.get("/api/rent-records", async (req, res) => res.json(await r.listRentRecords(req.user!.id)));
  app.get("/api/rent-records/:id", async (req, res) => {
    const item = await r.getRentRecord(req.user!.id, req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });
  app.post("/api/rent-records", async (req, res) => {
    const parsed = rentRecordCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const created = await r.createRentRecord(req.user!.id, parsed.data);
    await r.addActivity(req.user!.id, { action: "created", recordType: "rent", recordName: created.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after create rent record", e));
    res.status(201).json(created);
  });
  app.put("/api/rent-records/:id", async (req, res) => {
    const parsed = rentRecordUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const updated = await r.updateRentRecord(req.user!.id, req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    await r.addActivity(req.user!.id, { action: "updated", recordType: "rent", recordName: updated.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after update rent record", e));
    res.json(updated);
  });
  app.delete("/api/rent-records/:id", async (req, res) => {
    const cur = await r.getRentRecord(req.user!.id, req.params.id);
    const ok = await r.deleteRentRecord(req.user!.id, req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    if (cur) await r.addActivity(req.user!.id, { action: "deleted", recordType: "rent", recordName: cur.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after delete rent record", e));
    res.json({ ok: true });
  });

  // Reminders
  app.get("/api/reminders", async (req, res) => res.json(await r.listReminders(req.user!.id)));
  app.get("/api/reminders/:id", async (req, res) => {
    const item = await r.getReminder(req.user!.id, req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });
  app.post("/api/reminders", async (req, res) => {
    const parsed = reminderCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const created = await r.createReminder(req.user!.id, parsed.data);
    await r.addActivity(req.user!.id, { action: "created", recordType: "reminder", recordName: created.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after create reminder", e));
    res.status(201).json(created);
  });
  app.put("/api/reminders/:id", async (req, res) => {
    const parsed = reminderUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const updated = await r.updateReminder(req.user!.id, req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    await r.addActivity(req.user!.id, { action: "updated", recordType: "reminder", recordName: updated.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after update reminder", e));
    res.json(updated);
  });
  app.delete("/api/reminders/:id", async (req, res) => {
    const cur = await r.getReminder(req.user!.id, req.params.id);
    const ok = await r.deleteReminder(req.user!.id, req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    if (cur) await r.addActivity(req.user!.id, { action: "deleted", recordType: "reminder", recordName: cur.title });
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after delete reminder", e));
    res.json({ ok: true });
  });

  // Activity log
  app.get("/api/activity", async (req, res) => res.json(await r.listActivity(req.user!.id)));

  // Notifications aggregate (same idea as frontend NotificationCenter)
  app.get("/api/notifications", async (_req, res) => {
    const userId = _req.user!.id;
    const reminders = await r.listReminders(userId);
    const subscriptions = await r.listSubscriptions(userId);
    const rent = await r.listRentRecords(userId);

    const upcomingReminders = reminders.filter((x) => x.status === "pending" && isWithinNextDays(x.reminderDate, 7));
    const overdueReminders = reminders.filter((x) => x.status === "overdue" || (x.status === "pending" && isBeforeToday(x.reminderDate)));
    const expiringSubs = subscriptions.filter((s) => s.status === "active" && isWithinNextDays(s.renewalDate, 30));
    const overdueRent = rent.filter((rr) => isBeforeToday(rr.dueDate) && rr.status !== "completed");

    // Trigger email automation right after notifications are computed.
    // Fire-and-forget so the UI isn't slowed down.
    void runEmailAutomationOnce(r).catch((e) => console.error("email automation failed after notifications", e));

    res.json({ overdueReminders, overdueRent, expiringSubs, upcomingReminders });
  });
}

