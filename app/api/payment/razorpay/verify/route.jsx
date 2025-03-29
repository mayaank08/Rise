import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import crypto from "crypto";
import { db } from "@/configs/db";
import { USER_TABLE } from "@/configs/schema";
import { eq } from "drizzle-orm";

export async function POST(req) {
  try {
    const { email, orderId, paymentId, signature } = await req.json();

    console.log("Payment verification request:", {
      email,
      orderId,
      paymentId,
      signature,
    });

    // Verify the payment signature
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const body = orderId + "|" + paymentId;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    console.log("Signature verification:", {
      expected: expectedSignature,
      received: signature,
      matches: signature === expectedSignature,
    });

    if (signature === expectedSignature) {
      // Payment is valid
      console.log("Payment signature verified successfully");

      // Get user from database
      const user = await db
        .select()
        .from(USER_TABLE)
        .where(eq(USER_TABLE.email, email));

      if (!user || user.length === 0) {
        console.error("User not found in database:", email);
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      console.log("Updating membership status for user:", email);

      // Update user's membership status and credits
      const updateResult = await db
        .update(USER_TABLE)
        .set({
          is_member: true,
          credits: 999999, // Set unlimited credits
        })
        .where(eq(USER_TABLE.email, email))
        .returning();

      console.log("Membership update result:", updateResult);

      // Create a subscription for the user
      try {
        // First, check if the payment is already linked to a subscription
        console.log(
          "Checking if payment is already linked to a subscription..."
        );
        const payment = await razorpay.payments.fetch(paymentId);
        console.log("Payment details:", payment);

        let subscription;
        if (payment.notes && payment.notes.subscription_id) {
          // Payment is already linked to a subscription
          console.log(
            "Payment is already linked to subscription:",
            payment.notes.subscription_id
          );
          subscription = await razorpay.subscriptions.fetch(
            payment.notes.subscription_id
          );
        } else {
          // Create new subscription
          const currentTime = Math.floor(Date.now() / 1000);
          const subscriptionParams = {
            customer_id: user[0].customerId,
            plan_id: process.env.RAZORPAY_PLAN_ID,
            total_count: 12,
            quantity: 1,
            start_at: currentTime,
            expire_by: currentTime + 30 * 24 * 60 * 60, // 30 days from now
            customer_notify: 1,
            notes: {
              email: email,
              payment_id: paymentId,
              order_id: orderId,
            },
          };

          console.log(
            "Creating subscription with parameters:",
            subscriptionParams
          );

          // First, verify the plan exists
          const plan = await razorpay.plans.fetch(process.env.RAZORPAY_PLAN_ID);
          console.log("Plan details:", plan);

          // Create subscription
          subscription = await razorpay.subscriptions.create(
            subscriptionParams
          );
          console.log("Subscription created successfully:", subscription);

          // Link the payment to the subscription
          console.log("Linking payment to subscription...");
          await razorpay.subscriptions.update(subscription.id, {
            payment_id: paymentId,
            payment_method: "card",
          });
          console.log("Payment linked successfully");
        }

        // Store subscription ID in database
        console.log("Storing subscription ID in database");
        await db
          .update(USER_TABLE)
          .set({
            subscription_id: subscription.id,
            is_member: true,
            credits: 999999, // Set unlimited credits for members
          })
          .where(eq(USER_TABLE.email, email))
          .returning();

        console.log("Subscription ID stored successfully");

        // Fetch the updated subscription to verify status
        const updatedSubscription = await razorpay.subscriptions.fetch(
          subscription.id
        );
        console.log("Updated subscription status:", updatedSubscription.status);

        return NextResponse.json({
          success: true,
          message: "Payment verified and subscription created successfully",
          subscription: {
            id: updatedSubscription.id,
            status: updatedSubscription.status,
            current_start: updatedSubscription.current_start,
            current_end: updatedSubscription.current_end,
            payment_id: updatedSubscription.payment_id,
            short_url: updatedSubscription.short_url,
          },
        });
      } catch (subscriptionError) {
        console.error("Failed to create subscription:", {
          error: subscriptionError.message,
          response: subscriptionError.response?.data,
          status: subscriptionError.statusCode,
          code: subscriptionError.code,
          stack: subscriptionError.stack,
          details:
            subscriptionError.response?.data?.error?.description ||
            subscriptionError.response?.data?.error?.message,
          fullError: JSON.stringify(subscriptionError, null, 2),
        });

        // Try to create a one-time payment record instead
        try {
          console.log("Creating payment record instead of subscription");
          const payment = await razorpay.payments.fetch(paymentId);
          console.log("Payment details:", payment);

          // Store payment ID in database
          await db
            .update(USER_TABLE)
            .set({
              subscription_id: paymentId, // Use payment ID as subscription ID
              is_member: true,
              credits: 999999, // Set unlimited credits for members
            })
            .where(eq(USER_TABLE.email, email))
            .returning();

          console.log("Payment record stored successfully");

          return NextResponse.json({
            success: true,
            message: "Payment verified successfully",
            subscription: {
              id: paymentId,
              status: "active",
              payment_id: paymentId,
              amount: payment.amount,
              currency: payment.currency,
              created_at: payment.created_at,
            },
          });
        } catch (paymentError) {
          console.error("Failed to create payment record:", {
            error: paymentError.message,
            response: paymentError.response?.data,
            status: paymentError.statusCode,
            code: paymentError.code,
            stack: paymentError.stack,
          });

          // Even if both subscription and payment record creation fail,
          // we still want to return success since the payment was verified
          return NextResponse.json({
            success: true,
            message: "Payment verified successfully",
            warning:
              "Failed to create subscription or payment record, please contact support",
            error: paymentError.message || subscriptionError.message,
          });
        }
      }
    } else {
      console.error("Invalid payment signature");
      return NextResponse.json(
        {
          error: "Invalid payment signature",
          details: "The payment signature verification failed",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Payment verification error:", {
      error: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.statusCode,
      code: error.code,
    });
    return NextResponse.json(
      {
        error: "Failed to verify payment",
        details: error.message || "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
