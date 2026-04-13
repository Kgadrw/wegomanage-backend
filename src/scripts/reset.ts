import dotenv from "dotenv";
import { openDb, migrate } from "../db.js";
import { sqliteRepo } from "../repo.js";

dotenv.config();

const db = openDb();
migrate(db);
const r = sqliteRepo(db);

db.exec(`
  DELETE FROM products;
  DELETE FROM subscriptions;
  DELETE FROM rent_records;
  DELETE FROM reminders;
  DELETE FROM activity_log;
`);
db.exec(`DELETE FROM settings;`);

console.log("Reset complete");

