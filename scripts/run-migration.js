require("dotenv").config({ path: ".env.local" });
const { db } = require("../configs/db");
const fs = require("fs");
const path = require("path");

async function runMigration() {
  try {
    // Verify database URL is loaded
    if (!process.env.NEXT_PUBLIC_DATABASE_CONNECTION_STRING) {
      throw new Error(
        "NEXT_PUBLIC_DATABASE_CONNECTION_STRING environment variable is not set"
      );
    }

    // Read and execute the payment record migration
    const paymentRecordMigrationPath = path.join(
      process.cwd(),
      "drizzle",
      "0003_add_payment_record.sql"
    );
    const paymentRecordMigrationSQL = fs.readFileSync(
      paymentRecordMigrationPath,
      "utf8"
    );
    await db.execute(paymentRecordMigrationSQL);
    console.log("Payment record table migration completed successfully!");

    // Read and execute the credits column migration
    const creditsMigrationPath = path.join(
      process.cwd(),
      "drizzle",
      "0004_add_credits.sql"
    );
    const creditsMigrationSQL = fs.readFileSync(creditsMigrationPath, "utf8");
    await db.execute(creditsMigrationSQL);
    console.log("Credits column migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    process.exit();
  }
}

runMigration();
