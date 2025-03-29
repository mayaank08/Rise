import { NextResponse } from "next/server";
import Razorpay from "razorpay";

export async function POST(req) {
  try {
    // Debug logging
    console.log("Environment variables check:");
    console.log("RAZORPAY_KEY_ID exists:", !!process.env.RAZORPAY_KEY_ID);
    console.log(
      "RAZORPAY_KEY_SECRET exists:",
      !!process.env.RAZORPAY_KEY_SECRET
    );
    console.log("HOST_URL exists:", !!process.env.HOST_URL);
    console.log("HOST_URL value:", process.env.HOST_URL);

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay credentials are not configured");
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const { customerId } = await req.json();

    // Debug logging
    console.log("Received customerId:", customerId);

    if (!customerId) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    // Get customer's subscriptions
    const subscriptions = await razorpay.subscriptions.all({
      customer_id: customerId,
    });

    // If no active subscriptions, create a new order
    if (!subscriptions.items || subscriptions.items.length === 0) {
      const order = await razorpay.orders.create({
        amount: 99900, // Amount in paise (999 INR)
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
        customer_id: customerId,
      });

      return NextResponse.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
      });
    }

    // If there are active subscriptions, return subscription details
    return NextResponse.json({
      subscriptions: subscriptions.items,
    });
  } catch (error) {
    console.error("Razorpay error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to process payment management request",
      },
      { status: 500 }
    );
  }
}
