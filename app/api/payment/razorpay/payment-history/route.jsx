import { NextResponse } from "next/server";
import { db } from "@/configs/db";
import { PAYMENT_RECORD_TABLE } from "@/configs/schema";
import { eq } from "drizzle-orm";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    const payments = await db
      .select()
      .from(PAYMENT_RECORD_TABLE)
      .where(eq(PAYMENT_RECORD_TABLE.customerId, customerId));

    return NextResponse.json(payments);
  } catch (error) {
    console.error("Payment history error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch payment history" },
      { status: 500 }
    );
  }
}
