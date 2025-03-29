import { NextResponse } from "next/server";
import { db } from "@/configs/db";
import { USER_TABLE } from "@/configs/schema";
import { eq } from "drizzle-orm";

export async function POST(req) {
  try {
    const { email, isMember } = await req.json();

    if (!email || typeof isMember !== "boolean") {
      return NextResponse.json(
        { error: "Email and isMember status are required" },
        { status: 400 }
      );
    }

    await db
      .update(USER_TABLE)
      .set({ is_member: isMember })
      .where(eq(USER_TABLE.email, email));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating membership status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update membership status" },
      { status: 500 }
    );
  }
}
