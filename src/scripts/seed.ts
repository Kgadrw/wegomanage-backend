import dotenv from "dotenv";
import { openDb, migrate } from "../db.js";
import { sqliteRepo } from "../repo.js";
import { seedProducts, seedSubscriptions, seedRentRecords, seedReminders, seedActivityLog } from "../seed.js";

dotenv.config();

const db = openDb();
migrate(db);
const r = sqliteRepo(db);

for (const p of seedProducts) {
  db.prepare(
    `INSERT OR IGNORE INTO products(id,name,category,vendor,purchaseDate,purchaseCost,warrantyExpiry,serialNumber,assignedTo,status,notes,createdAt)
     VALUES(@id,@name,@category,@vendor,@purchaseDate,@purchaseCost,@warrantyExpiry,@serialNumber,@assignedTo,@status,@notes,@createdAt)`,
  ).run(p);
}

for (const s of seedSubscriptions) {
  db.prepare(
    `INSERT OR IGNORE INTO subscriptions(id,name,provider,planType,amount,billingCycle,startDate,renewalDate,paymentMethod,status,reminderDaysBefore,payerName,payerEmail,notes,createdAt)
     VALUES(@id,@name,@provider,@planType,@amount,@billingCycle,@startDate,@renewalDate,@paymentMethod,@status,@reminderDaysBefore,@payerName,@payerEmail,@notes,@createdAt)`,
  ).run(s);
}

for (const rr of seedRentRecords) {
  db.prepare(
    `INSERT OR IGNORE INTO rent_records(id,title,propertyType,contactName,rentAmount,paymentFrequency,dueDate,contractStartDate,contractEndDate,status,payerName,payerEmail,notes,createdAt)
     VALUES(@id,@title,@propertyType,@contactName,@rentAmount,@paymentFrequency,@dueDate,@contractStartDate,@contractEndDate,@status,@payerName,@payerEmail,@notes,@createdAt)`,
  ).run(rr);
}

for (const rm of seedReminders) {
  db.prepare(
    `INSERT OR IGNORE INTO reminders(id,title,relatedType,relatedId,reminderDate,priority,status,message,createdAt)
     VALUES(@id,@title,@relatedType,@relatedId,@reminderDate,@priority,@status,@message,@createdAt)`,
  ).run(rm);
}

for (const a of seedActivityLog) {
  db.prepare(
    `INSERT OR IGNORE INTO activity_log(id,action,recordType,recordName,timestamp)
     VALUES(@id,@action,@recordType,@recordName,@timestamp)`,
  ).run(a);
}

if (!(await r.getSetting("usd_to_frw_rate"))) {
  await r.setSetting("usd_to_frw_rate", "1300");
}

console.log("Seed complete");

