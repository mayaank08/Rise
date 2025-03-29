const { drizzle } = require("drizzle-orm/neon-http");
const { neon } = require("@neondatabase/serverless");

if (!process.env.NEXT_PUBLIC_DATABASE_CONNECTION_STRING) {
  throw new Error(
    "NEXT_PUBLIC_DATABASE_CONNECTION_STRING environment variable is not set"
  );
}

const sql = neon(process.env.NEXT_PUBLIC_DATABASE_CONNECTION_STRING);
const db = drizzle(sql);

module.exports = { db };
