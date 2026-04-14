import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { isoDateOnly } from "./lib/time.js";
import type { ActivityLog, Product, Reminder, RentRecord, Subscription, User } from "./types.js";
import type { MongoClient, Collection } from "mongodb";

function row<T>(x: unknown): T {
  return x as T;
}

export type Repo = {
  // Users / Auth
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  createUser(input: { email: string; passwordSalt: string; passwordHash: string }): Promise<User>;
  updateUserCredentials(userId: string, patch: { email?: string; passwordSalt?: string; passwordHash?: string }): Promise<User | null>;

  createRefreshToken(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<void>;
  getRefreshTokenByHash(tokenHash: string): Promise<{ userId: string; expiresAt: string; revokedAt: string | null } | null>;
  revokeRefreshTokenByHash(tokenHash: string): Promise<void>;
  revokeAllRefreshTokensForUser(userId: string): Promise<void>;
  isRefreshTokenActive(tokenHash: string): Promise<boolean>;

  createPasswordResetCode(input: { userId: string; codeHash: string; expiresAt: string }): Promise<void>;
  consumePasswordResetCode(input: { userId: string; codeHash: string }): Promise<boolean>;

  // Settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  // Products
  listProducts(userId: string): Promise<Product[]>;
  getProduct(userId: string, id: string): Promise<Product | null>;
  createProduct(userId: string, input: Omit<Product, "id" | "createdAt" | "userId">): Promise<Product>;
  updateProduct(userId: string, id: string, patch: Partial<Omit<Product, "id" | "createdAt" | "userId">>): Promise<Product | null>;
  deleteProduct(userId: string, id: string): Promise<boolean>;

  // Subscriptions
  listSubscriptions(userId: string): Promise<Subscription[]>;
  getSubscription(userId: string, id: string): Promise<Subscription | null>;
  createSubscription(userId: string, input: Omit<Subscription, "id" | "createdAt" | "userId">): Promise<Subscription>;
  updateSubscription(userId: string, id: string, patch: Partial<Omit<Subscription, "id" | "createdAt" | "userId">>): Promise<Subscription | null>;
  deleteSubscription(userId: string, id: string): Promise<boolean>;

  // Rent
  listRentRecords(userId: string): Promise<RentRecord[]>;
  getRentRecord(userId: string, id: string): Promise<RentRecord | null>;
  createRentRecord(userId: string, input: Omit<RentRecord, "id" | "createdAt" | "userId">): Promise<RentRecord>;
  updateRentRecord(userId: string, id: string, patch: Partial<Omit<RentRecord, "id" | "createdAt" | "userId">>): Promise<RentRecord | null>;
  deleteRentRecord(userId: string, id: string): Promise<boolean>;

  // Reminders
  listReminders(userId: string): Promise<Reminder[]>;
  getReminder(userId: string, id: string): Promise<Reminder | null>;
  createReminder(userId: string, input: Omit<Reminder, "id" | "createdAt" | "userId">): Promise<Reminder>;
  updateReminder(userId: string, id: string, patch: Partial<Omit<Reminder, "id" | "createdAt" | "userId">>): Promise<Reminder | null>;
  deleteReminder(userId: string, id: string): Promise<boolean>;

  // Activity
  listActivity(userId: string): Promise<ActivityLog[]>;
  addActivity(userId: string, input: Omit<ActivityLog, "id" | "timestamp" | "userId"> & { timestamp?: string }): Promise<ActivityLog>;
};

export function sqliteRepo(db: Db): Repo {
  return {
    // Users / Auth
    async getUserByEmail(email: string) {
      const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;
      return row ?? null;
    },
    async getUserById(id: string) {
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
      return row ?? null;
    },
    async createUser(input) {
      const u: User = {
        id: randomUUID(),
        email: input.email.trim().toLowerCase(),
        passwordSalt: input.passwordSalt,
        passwordHash: input.passwordHash,
        createdAt: new Date().toISOString(),
      };
      db.prepare(
        `INSERT INTO users(id,email,passwordSalt,passwordHash,createdAt)
         VALUES(@id,@email,@passwordSalt,@passwordHash,@createdAt)`,
      ).run(u);
      return u;
    },
    async updateUserCredentials(userId, patch) {
      const cur = await this.getUserById(userId);
      if (!cur) return null;
      const next: User = {
        ...cur,
        email: patch.email !== undefined ? patch.email.trim().toLowerCase() : cur.email,
        passwordSalt: patch.passwordSalt ?? cur.passwordSalt,
        passwordHash: patch.passwordHash ?? cur.passwordHash,
      };
      db.prepare(
        `UPDATE users SET email=@email, passwordSalt=@passwordSalt, passwordHash=@passwordHash WHERE id=@id`,
      ).run({ ...next, id: userId });
      return next;
    },

    async createRefreshToken(input) {
      db.prepare(
        `INSERT INTO refresh_tokens(id,userId,tokenHash,expiresAt,createdAt,revokedAt)
         VALUES(@id,@userId,@tokenHash,@expiresAt,@createdAt,NULL)`,
      ).run({ id: randomUUID(), userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt, createdAt: new Date().toISOString() });
    },
    async getRefreshTokenByHash(tokenHash: string) {
      const row = db.prepare(`SELECT userId, expiresAt, revokedAt FROM refresh_tokens WHERE tokenHash = ?`).get(tokenHash) as { userId: string; expiresAt: string; revokedAt: string | null } | undefined;
      return row ?? null;
    },
    async revokeRefreshTokenByHash(tokenHash: string) {
      db.prepare(`UPDATE refresh_tokens SET revokedAt=@revokedAt WHERE tokenHash=@tokenHash AND revokedAt IS NULL`)
        .run({ tokenHash, revokedAt: new Date().toISOString() });
    },
    async revokeAllRefreshTokensForUser(userId: string) {
      db.prepare(`UPDATE refresh_tokens SET revokedAt=@revokedAt WHERE userId=@userId AND revokedAt IS NULL`)
        .run({ userId, revokedAt: new Date().toISOString() });
    },
    async isRefreshTokenActive(tokenHash: string) {
      const row = db.prepare(`SELECT expiresAt, revokedAt FROM refresh_tokens WHERE tokenHash = ?`).get(tokenHash) as { expiresAt: string; revokedAt: string | null } | undefined;
      if (!row) return false;
      if (row.revokedAt) return false;
      return row.expiresAt > new Date().toISOString();
    },

    async createPasswordResetCode(input) {
      db.prepare(
        `INSERT INTO password_reset_codes(id,userId,codeHash,expiresAt,createdAt,usedAt)
         VALUES(@id,@userId,@codeHash,@expiresAt,@createdAt,NULL)`,
      ).run({ id: randomUUID(), userId: input.userId, codeHash: input.codeHash, expiresAt: input.expiresAt, createdAt: new Date().toISOString() });
    },
    async consumePasswordResetCode(input) {
      const row = db.prepare(
        `SELECT id, expiresAt, usedAt FROM password_reset_codes
         WHERE userId=@userId AND codeHash=@codeHash
         ORDER BY createdAt DESC LIMIT 1`,
      ).get(input) as { id: string; expiresAt: string; usedAt: string | null } | undefined;
      if (!row) return false;
      if (row.usedAt) return false;
      if (row.expiresAt <= new Date().toISOString()) return false;
      db.prepare(`UPDATE password_reset_codes SET usedAt=@usedAt WHERE id=@id`).run({ id: row.id, usedAt: new Date().toISOString() });
      return true;
    },

    // Settings
    async getSetting(key: string) {
      const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      return r?.value ?? null;
    },
    async setSetting(key: string, value: string) {
      db.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .run(key, value);
    },

    // Products
    async listProducts(userId: string): Promise<Product[]> {
      return db.prepare("SELECT * FROM products WHERE userId = ? ORDER BY createdAt DESC").all(userId).map(row<Product>);
    },
    async getProduct(userId: string, id: string): Promise<Product | null> {
      return (db.prepare("SELECT * FROM products WHERE userId = ? AND id = ?").get(userId, id) as Product | undefined) ?? null;
    },
    async createProduct(userId: string, input: Omit<Product, "id" | "createdAt" | "userId">): Promise<Product> {
      const p: Product = { ...input, userId, id: randomUUID(), createdAt: isoDateOnly() };
      db.prepare(
        `INSERT INTO products(id,userId,name,category,vendor,purchaseDate,purchaseCost,warrantyExpiry,serialNumber,assignedTo,status,notes,createdAt)
         VALUES(@id,@userId,@name,@category,@vendor,@purchaseDate,@purchaseCost,@warrantyExpiry,@serialNumber,@assignedTo,@status,@notes,@createdAt)`,
      ).run(p);
      return p;
    },
    async updateProduct(userId: string, id: string, patch: Partial<Omit<Product, "id" | "createdAt" | "userId">>): Promise<Product | null> {
      const cur = await this.getProduct(userId, id);
      if (!cur) return null;
      const next: Product = { ...cur, ...patch, userId: cur.userId };
      db.prepare(
        `UPDATE products SET
          name=@name, category=@category, vendor=@vendor, purchaseDate=@purchaseDate, purchaseCost=@purchaseCost,
          warrantyExpiry=@warrantyExpiry, serialNumber=@serialNumber, assignedTo=@assignedTo, status=@status, notes=@notes
         WHERE userId=@userId AND id=@id`,
      ).run({ ...next, id });
      return next;
    },
    async deleteProduct(userId: string, id: string): Promise<boolean> {
      const info = db.prepare("DELETE FROM products WHERE userId = ? AND id = ?").run(userId, id);
      return info.changes > 0;
    },

    // Subscriptions
    async listSubscriptions(userId: string): Promise<Subscription[]> {
      return db.prepare("SELECT * FROM subscriptions WHERE userId = ? ORDER BY createdAt DESC").all(userId).map(row<Subscription>);
    },
    async getSubscription(userId: string, id: string): Promise<Subscription | null> {
      return (db.prepare("SELECT * FROM subscriptions WHERE userId = ? AND id = ?").get(userId, id) as Subscription | undefined) ?? null;
    },
    async createSubscription(userId: string, input: Omit<Subscription, "id" | "createdAt" | "userId">): Promise<Subscription> {
      const s: Subscription = { ...input, userId, id: randomUUID(), createdAt: isoDateOnly() };
      db.prepare(
        `INSERT INTO subscriptions(id,userId,name,provider,planType,amount,billingCycle,startDate,renewalDate,paymentMethod,payerName,payerEmail,status,reminderDaysBefore,notes,createdAt)
         VALUES(@id,@userId,@name,@provider,@planType,@amount,@billingCycle,@startDate,@renewalDate,@paymentMethod,@payerName,@payerEmail,@status,@reminderDaysBefore,@notes,@createdAt)`,
      ).run(s);
      return s;
    },
    async updateSubscription(userId: string, id: string, patch: Partial<Omit<Subscription, "id" | "createdAt" | "userId">>): Promise<Subscription | null> {
      const cur = await this.getSubscription(userId, id);
      if (!cur) return null;
      const next: Subscription = { ...cur, ...patch, userId: cur.userId };
      db.prepare(
        `UPDATE subscriptions SET
          name=@name, provider=@provider, planType=@planType, amount=@amount, billingCycle=@billingCycle,
          startDate=@startDate, renewalDate=@renewalDate, paymentMethod=@paymentMethod, payerName=@payerName, payerEmail=@payerEmail, status=@status,
          reminderDaysBefore=@reminderDaysBefore, notes=@notes
         WHERE userId=@userId AND id=@id`,
      ).run({ ...next, id });
      return next;
    },
    async deleteSubscription(userId: string, id: string): Promise<boolean> {
      const info = db.prepare("DELETE FROM subscriptions WHERE userId = ? AND id = ?").run(userId, id);
      return info.changes > 0;
    },

    // Rent
    async listRentRecords(userId: string): Promise<RentRecord[]> {
      return db.prepare("SELECT * FROM rent_records WHERE userId = ? ORDER BY createdAt DESC").all(userId).map(row<RentRecord>);
    },
    async getRentRecord(userId: string, id: string): Promise<RentRecord | null> {
      return (db.prepare("SELECT * FROM rent_records WHERE userId = ? AND id = ?").get(userId, id) as RentRecord | undefined) ?? null;
    },
    async createRentRecord(userId: string, input: Omit<RentRecord, "id" | "createdAt" | "userId">): Promise<RentRecord> {
      const r: RentRecord = { ...input, userId, id: randomUUID(), createdAt: isoDateOnly() };
      db.prepare(
        `INSERT INTO rent_records(id,userId,title,propertyType,contactName,payerName,payerEmail,rentAmount,paymentFrequency,dueDate,contractStartDate,contractEndDate,status,notes,createdAt)
         VALUES(@id,@userId,@title,@propertyType,@contactName,@payerName,@payerEmail,@rentAmount,@paymentFrequency,@dueDate,@contractStartDate,@contractEndDate,@status,@notes,@createdAt)`,
      ).run(r);
      return r;
    },
    async updateRentRecord(userId: string, id: string, patch: Partial<Omit<RentRecord, "id" | "createdAt" | "userId">>): Promise<RentRecord | null> {
      const cur = await this.getRentRecord(userId, id);
      if (!cur) return null;
      const next: RentRecord = { ...cur, ...patch, userId: cur.userId };
      db.prepare(
        `UPDATE rent_records SET
          title=@title, propertyType=@propertyType, contactName=@contactName, payerName=@payerName, payerEmail=@payerEmail, rentAmount=@rentAmount, paymentFrequency=@paymentFrequency,
          dueDate=@dueDate, contractStartDate=@contractStartDate, contractEndDate=@contractEndDate, status=@status, notes=@notes
         WHERE userId=@userId AND id=@id`,
      ).run({ ...next, id });
      return next;
    },
    async deleteRentRecord(userId: string, id: string): Promise<boolean> {
      const info = db.prepare("DELETE FROM rent_records WHERE userId = ? AND id = ?").run(userId, id);
      return info.changes > 0;
    },

    // Reminders
    async listReminders(userId: string): Promise<Reminder[]> {
      return db.prepare("SELECT * FROM reminders WHERE userId = ? ORDER BY createdAt DESC").all(userId).map(row<Reminder>);
    },
    async getReminder(userId: string, id: string): Promise<Reminder | null> {
      return (db.prepare("SELECT * FROM reminders WHERE userId = ? AND id = ?").get(userId, id) as Reminder | undefined) ?? null;
    },
    async createReminder(userId: string, input: Omit<Reminder, "id" | "createdAt" | "userId">): Promise<Reminder> {
      const r: Reminder = { ...input, userId, id: randomUUID(), createdAt: isoDateOnly() };
      db.prepare(
        `INSERT INTO reminders(id,userId,title,relatedType,relatedId,reminderDate,priority,status,message,createdAt)
         VALUES(@id,@userId,@title,@relatedType,@relatedId,@reminderDate,@priority,@status,@message,@createdAt)`,
      ).run(r);
      return r;
    },
    async updateReminder(userId: string, id: string, patch: Partial<Omit<Reminder, "id" | "createdAt" | "userId">>): Promise<Reminder | null> {
      const cur = await this.getReminder(userId, id);
      if (!cur) return null;
      const next: Reminder = { ...cur, ...patch, userId: cur.userId };
      db.prepare(
        `UPDATE reminders SET
          title=@title, relatedType=@relatedType, relatedId=@relatedId, reminderDate=@reminderDate,
          priority=@priority, status=@status, message=@message
         WHERE userId=@userId AND id=@id`,
      ).run({ ...next, id });
      return next;
    },
    async deleteReminder(userId: string, id: string): Promise<boolean> {
      const info = db.prepare("DELETE FROM reminders WHERE userId = ? AND id = ?").run(userId, id);
      return info.changes > 0;
    },

    // Activity
    async listActivity(userId: string): Promise<ActivityLog[]> {
      return db.prepare("SELECT * FROM activity_log WHERE userId = ? ORDER BY timestamp DESC").all(userId).map(row<ActivityLog>);
    },
    async addActivity(userId: string, input: Omit<ActivityLog, "id" | "timestamp" | "userId"> & { timestamp?: string }): Promise<ActivityLog> {
      const a: ActivityLog = {
        id: randomUUID(),
        timestamp: input.timestamp ?? new Date().toISOString(),
        userId,
        action: input.action,
        recordType: input.recordType,
        recordName: input.recordName,
      };
      db.prepare(
        `INSERT INTO activity_log(id,userId,action,recordType,recordName,timestamp)
         VALUES(@id,@userId,@action,@recordType,@recordName,@timestamp)`,
      ).run(a);
      return a;
    },
  };
}

function coll<T extends { id: string }>(client: MongoClient, name: string): Collection<T> {
  const dbName = process.env.MONGODB_DB || "wegomanage";
  return client.db(dbName).collection<T>(name);
}

export function mongoRepo(client: MongoClient): Repo {
  const settings = client.db(process.env.MONGODB_DB || "wegomanage").collection<{ key: string; value: string }>("settings");
  const users = coll<User>(client, "users");
  const refreshTokens = client.db(process.env.MONGODB_DB || "wegomanage").collection<{
    id: string; userId: string; tokenHash: string; expiresAt: string; createdAt: string; revokedAt?: string | null;
  }>("refresh_tokens");
  const passwordResetCodes = client.db(process.env.MONGODB_DB || "wegomanage").collection<{
    id: string; userId: string; codeHash: string; expiresAt: string; createdAt: string; usedAt?: string | null;
  }>("password_reset_codes");
  const products = coll<Product>(client, "products");
  const subscriptions = coll<Subscription>(client, "subscriptions");
  const rentRecords = coll<RentRecord>(client, "rent_records");
  const reminders = coll<Reminder>(client, "reminders");
  const activity = coll<ActivityLog>(client, "activity_log");

  return {
    async getUserByEmail(email: string) {
      return await users.findOne({ email: email.trim().toLowerCase() });
    },
    async getUserById(id: string) {
      return await users.findOne({ id });
    },
    async createUser(input) {
      const u: User = {
        id: randomUUID(),
        email: input.email.trim().toLowerCase(),
        passwordSalt: input.passwordSalt,
        passwordHash: input.passwordHash,
        createdAt: new Date().toISOString(),
      };
      await users.insertOne(u);
      return u;
    },
    async updateUserCredentials(userId, patch) {
      const cur = await users.findOne({ id: userId });
      if (!cur) return null;
      const next: User = {
        ...cur,
        email: patch.email !== undefined ? patch.email.trim().toLowerCase() : cur.email,
        passwordSalt: patch.passwordSalt ?? cur.passwordSalt,
        passwordHash: patch.passwordHash ?? cur.passwordHash,
      };
      await users.updateOne({ id: userId }, { $set: next });
      return next;
    },

    async createRefreshToken(input) {
      await refreshTokens.insertOne({
        id: randomUUID(),
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: new Date().toISOString(),
        revokedAt: null,
      });
    },
    async getRefreshTokenByHash(tokenHash: string) {
      const row = await refreshTokens.findOne({ tokenHash });
      if (!row) return null;
      return { userId: row.userId, expiresAt: row.expiresAt, revokedAt: (row.revokedAt as any) ?? null };
    },
    async revokeRefreshTokenByHash(tokenHash: string) {
      await refreshTokens.updateMany({ tokenHash, revokedAt: null }, { $set: { revokedAt: new Date().toISOString() } });
    },
    async revokeAllRefreshTokensForUser(userId: string) {
      await refreshTokens.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date().toISOString() } });
    },
    async isRefreshTokenActive(tokenHash: string) {
      const row = await refreshTokens.findOne({ tokenHash });
      if (!row) return false;
      if (row.revokedAt) return false;
      return row.expiresAt > new Date().toISOString();
    },

    async createPasswordResetCode(input) {
      await passwordResetCodes.insertOne({
        id: randomUUID(),
        userId: input.userId,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        createdAt: new Date().toISOString(),
        usedAt: null,
      });
    },
    async consumePasswordResetCode(input) {
      const row = await passwordResetCodes.find({ userId: input.userId, codeHash: input.codeHash })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();
      const doc = row[0];
      if (!doc) return false;
      if (doc.usedAt) return false;
      if (doc.expiresAt <= new Date().toISOString()) return false;
      await passwordResetCodes.updateOne({ id: doc.id }, { $set: { usedAt: new Date().toISOString() } });
      return true;
    },

    async getSetting(key: string) {
      const doc = await settings.findOne({ key });
      return doc?.value ?? null;
    },
    async setSetting(key: string, value: string) {
      await settings.updateOne({ key }, { $set: { key, value } }, { upsert: true });
    },

    async listProducts(userId: string) {
      return await products.find({ userId }).sort({ createdAt: -1 }).toArray();
    },
    async getProduct(userId: string, id: string) {
      return await products.findOne({ userId, id });
    },
    async createProduct(userId: string, input) {
      const p: Product = { ...input, userId, id: randomUUID(), createdAt: isoDateOnly() };
      await products.insertOne(p);
      return p;
    },
    async updateProduct(userId, id, patch) {
      const cur = await products.findOne({ userId, id });
      if (!cur) return null;
      const next: Product = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt };
      await products.updateOne({ userId, id }, { $set: next });
      return next;
    },
    async deleteProduct(userId, id) {
      const res = await products.deleteOne({ userId, id });
      return res.deletedCount > 0;
    },

    async listSubscriptions(userId: string) {
      return await subscriptions.find({ userId }).sort({ createdAt: -1 }).toArray();
    },
    async getSubscription(userId: string, id: string) {
      return await subscriptions.findOne({ userId, id });
    },
    async createSubscription(userId: string, input) {
      const s: Subscription = { ...input, userId, id: randomUUID(), createdAt: isoDateOnly() };
      await subscriptions.insertOne(s);
      return s;
    },
    async updateSubscription(userId, id, patch) {
      const cur = await subscriptions.findOne({ userId, id });
      if (!cur) return null;
      const next: Subscription = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt };
      await subscriptions.updateOne({ userId, id }, { $set: next });
      return next;
    },
    async deleteSubscription(userId, id) {
      const res = await subscriptions.deleteOne({ userId, id });
      return res.deletedCount > 0;
    },

    async listRentRecords(userId: string) {
      return await rentRecords.find({ userId }).sort({ createdAt: -1 }).toArray();
    },
    async getRentRecord(userId: string, id: string) {
      return await rentRecords.findOne({ userId, id });
    },
    async createRentRecord(userId: string, input) {
      const r: RentRecord = { ...input, userId, id: randomUUID(), createdAt: isoDateOnly() };
      await rentRecords.insertOne(r);
      return r;
    },
    async updateRentRecord(userId, id, patch) {
      const cur = await rentRecords.findOne({ userId, id });
      if (!cur) return null;
      const next: RentRecord = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt };
      await rentRecords.updateOne({ userId, id }, { $set: next });
      return next;
    },
    async deleteRentRecord(userId, id) {
      const res = await rentRecords.deleteOne({ userId, id });
      return res.deletedCount > 0;
    },

    async listReminders(userId: string) {
      return await reminders.find({ userId }).sort({ createdAt: -1 }).toArray();
    },
    async getReminder(userId: string, id: string) {
      return await reminders.findOne({ userId, id });
    },
    async createReminder(userId: string, input) {
      const r: Reminder = { ...input, userId, id: randomUUID(), createdAt: isoDateOnly() };
      await reminders.insertOne(r);
      return r;
    },
    async updateReminder(userId, id, patch) {
      const cur = await reminders.findOne({ userId, id });
      if (!cur) return null;
      const next: Reminder = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt };
      await reminders.updateOne({ userId, id }, { $set: next });
      return next;
    },
    async deleteReminder(userId, id) {
      const res = await reminders.deleteOne({ userId, id });
      return res.deletedCount > 0;
    },

    async listActivity(userId: string) {
      return await activity.find({ userId }).sort({ timestamp: -1 }).toArray();
    },
    async addActivity(userId: string, input) {
      const a: ActivityLog = {
        id: randomUUID(),
        timestamp: input.timestamp ?? new Date().toISOString(),
        userId,
        action: input.action,
        recordType: input.recordType,
        recordName: input.recordName,
      };
      await activity.insertOne(a);
      return a;
    },
  };
}


