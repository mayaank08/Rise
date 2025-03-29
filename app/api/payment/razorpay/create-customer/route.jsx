import { NextResponse } from "next/server";
import Razorpay from "razorpay";

export async function POST(req) {
  try {
    // Debug logging
    console.log("=== Starting Customer Creation ===");
    console.log("Environment variables check:");
    console.log("RAZORPAY_KEY_ID:", process.env.RAZORPAY_KEY_ID);
    console.log(
      "RAZORPAY_KEY_SECRET length:",
      process.env.RAZORPAY_KEY_SECRET?.length
    );

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error("Missing Razorpay credentials");
      throw new Error("Razorpay credentials are not configured");
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const body = await req.json();
    console.log("Request body:", body);

    const { email, name } = body;

    if (!email || !name) {
      console.error("Missing required fields:", { email, name });
      return NextResponse.json(
        { error: "Email and name are required" },
        { status: 400 }
      );
    }

    // Debug logging
    console.log("Creating customer with:", { email, name });

    try {
      const customer = await razorpay.customers.create({
        email,
        name,
      });

      // Debug logging
      console.log("Customer created successfully:", customer);

      return NextResponse.json(customer);
    } catch (razorpayError) {
      console.error("Razorpay API Error:", {
        message: razorpayError.message,
        statusCode: razorpayError.statusCode,
        error: razorpayError.error,
        response: razorpayError.response?.data,
        stack: razorpayError.stack,
      });

      // Return a more detailed error response
      return NextResponse.json(
        {
          error: razorpayError.message || "Failed to create customer",
          details:
            razorpayError.error ||
            razorpayError.response?.data ||
            "No additional details available",
          statusCode: razorpayError.statusCode,
        },
        { status: razorpayError.statusCode || 500 }
      );
    }
  } catch (error) {
    console.error("General error in customer creation:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      statusCode: error.statusCode,
      error: error.error,
    });

    return NextResponse.json(
      {
        error: error.message || "Failed to create customer",
        details:
          error.response?.data ||
          error.error ||
          "No additional details available",
        statusCode: error.statusCode,
      },
      { status: error.statusCode || 500 }
    );
  }
}
