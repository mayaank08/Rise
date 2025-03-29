import { NextResponse } from "next/server";
import { db } from "@/configs/db";
import { USER_TABLE } from "@/configs/schema";
import { eq } from "drizzle-orm";

export async function POST(req) {
  try {
    const { email, customerId } = await req.json();

    if (!email || !customerId) {
      return NextResponse.json(
        { error: "Email and customer ID are required" },
        { status: 400 }
      );
    }

    await db
      .update(USER_TABLE)
      .set({ customerId })
      .where(eq(USER_TABLE.email, email));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating customer ID:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update customer ID" },
      { status: 500 }
    );
  }
}
