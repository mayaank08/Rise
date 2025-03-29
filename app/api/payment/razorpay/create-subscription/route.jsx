import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { db } from "@/configs/db";
import { USER_TABLE } from "@/configs/schema";
import { eq } from "drizzle-orm";

export async function POST(req) {
  try {
    const { email, customerId } = await req.json();

    console.log("Create subscription request:", { email, customerId });

    if (!email || !customerId) {
      console.error("Missing required fields:", { email, customerId });
      return NextResponse.json(
        { error: "Email and customer ID are required" },
        { status: 400 }
      );
    }

    // Get user from database
    const user = await db
      .select()
      .from(USER_TABLE)
      .where(eq(USER_TABLE.email, email));

    console.log("Database user result:", user);

    if (!user || user.length === 0) {
      console.error("User not found in database:", email);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Initialize Razorpay with error handling
    let razorpay;
    try {
      razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
      console.log("Razorpay instance created successfully");
    } catch (error) {
      console.error("Failed to initialize Razorpay:", {
        error: error.message,
        stack: error.stack,
      });
      return NextResponse.json(
        { error: "Failed to initialize payment service" },
        { status: 500 }
      );
    }

    // Create subscription
    try {
      const subscription = await razorpay.subscriptions.create({
        customer_id: customerId,
        plan_id: process.env.RAZORPAY_PLAN_ID, // Make sure this is set in your .env.local
        total_count: 12, // 12 months subscription
        quantity: 1,
        notes: {
          email: email,
        },
      });

      console.log("Subscription created successfully:", subscription);

      // Update user's membership status
      await db
        .update(USER_TABLE)
        .set({
          is_member: true,
          credits: 999999, // Set unlimited credits
        })
        .where(eq(USER_TABLE.email, email));

      return NextResponse.json({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          current_start: subscription.current_start,
          current_end: subscription.current_end,
          total_count: subscription.total_count,
          paid_count: subscription.paid_count,
        },
      });
    } catch (error) {
      console.error("Failed to create subscription:", {
        error: error.message,
        response: error.response?.data,
        status: error.statusCode,
        code: error.code,
      });

      // Check if it's an authentication error
      if (error.statusCode === 401) {
        return NextResponse.json(
          {
            error: "Authentication failed",
            details:
              "Failed to authenticate with Razorpay. Please check your API credentials.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: "Failed to create subscription",
          details: error.response?.data || error.message,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Subscription creation error:", {
      error: error,
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      statusCode: error.statusCode,
      code: error.code,
    });
    return NextResponse.json(
      {
        error: error.message || "Failed to create subscription",
        details: error.response?.data || "No additional details available",
      },
      { status: 500 }
    );
  }
}
