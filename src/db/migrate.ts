import "dotenv/config";
import { initDb } from "./connection";

console.log("Running migrations...");
initDb();
console.log("Database schema applied.");
