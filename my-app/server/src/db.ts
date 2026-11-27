import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing from .env");
}

const ssl = process.env.DB_SSL === 'false'
  ? false
  : { rejectUnauthorized: false };

export const pool = new Pool({
  connectionString,
  ssl,
  max: 5,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});
