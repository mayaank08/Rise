import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { db } from "@/configs/db";
import { USER_TABLE } from "@/configs/schema";
import { eq } from "drizzle-orm";

export async function POST(req) {
  try {
    const { email, action } = await req.json();

    console.log("Subscription management request:", { email, action });

    if (!email || !action) {
      console.error("Missing required fields:", { email, action });
      return NextResponse.json(
        { error: "Email and action are required" },
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

    if (!user[0].customerId) {
      console.error("User has no customer ID:", email);
      return NextResponse.json(
        { error: "User has no associated payment account" },
        { status: 400 }
      );
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

    // If user has a subscription ID, try to fetch that subscription
    if (user[0].subscription_id) {
      try {
        console.log("Fetching subscription by ID:", user[0].subscription_id);
        const subscription = await razorpay.subscriptions.fetch(
          user[0].subscription_id
        );
        console.log("Subscription details:", subscription);

        if (action === "cancel") {
          console.log("Cancelling subscription:", subscription.id);
          await razorpay.subscriptions.cancel(subscription.id);
          console.log("Subscription cancelled successfully");

          // Update user's membership status
          await db
            .update(USER_TABLE)
            .set({
              is_member: false,
              credits: 5, // Reset to default credits
              subscription_id: null,
            })
            .where(eq(USER_TABLE.email, email));
          console.log("User membership status updated successfully");

          return NextResponse.json({
            success: true,
            message: "Subscription cancelled successfully",
          });
        } else if (action === "get") {
          console.log("Returning subscription details");
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
        }
      } catch (error) {
        console.error("Failed to fetch subscription:", {
          error: error.message,
          response: error.response?.data,
          status: error.statusCode,
          code: error.code,
        });

        // If subscription not found, try to fetch from customer subscriptions
        if (error.statusCode === 404) {
          console.log(
            "Subscription not found by ID, trying customer subscriptions"
          );
        } else {
          throw error;
        }
      }
    }

    // If no subscription ID or subscription not found, try to fetch from customer subscriptions
    console.log("Fetching subscriptions for customer:", user[0].customerId);

    try {
      // First, verify the customer exists
      console.log("Verifying customer exists...");
      const customer = await razorpay.customers.fetch(user[0].customerId);
      console.log("Customer details:", customer);

      // Try to fetch subscriptions
      console.log("Fetching subscriptions...");
      const subscriptions = await razorpay.subscriptions.all({
        count: 100, // Get all subscriptions
      });

      console.log(
        "Razorpay subscriptions response:",
        JSON.stringify(subscriptions, null, 2)
      );

      // Filter subscriptions for this customer
      const customerSubscriptions = subscriptions.items.filter(
        (sub) => sub.customer_id === user[0].customerId
      );

      console.log("Customer subscriptions:", customerSubscriptions);

      // If no subscriptions found, try to fetch payment records
      if (!customerSubscriptions || customerSubscriptions.length === 0) {
        console.log("No subscriptions found, checking payment records...");
        const payments = await razorpay.payments.all({
          customer_id: user[0].customerId,
          count: 100,
        });

        console.log("Payment records:", payments);

        if (payments.items && payments.items.length > 0) {
          // Get the most recent payment
          const latestPayment = payments.items[0];
          console.log("Latest payment:", latestPayment);

          if (action === "cancel") {
            // For payments, we can't cancel but we can update the user's status
            console.log("Updating user membership status to false");
            await db
              .update(USER_TABLE)
              .set({
                is_member: false,
                credits: 5, // Reset to default credits
                subscription_id: null,
              })
              .where(eq(USER_TABLE.email, email))
              .returning();

            return NextResponse.json({
              success: true,
              message: "Membership cancelled successfully",
            });
          } else if (action === "get") {
            return NextResponse.json({
              success: true,
              subscription: {
                id: latestPayment.id,
                status: "active",
                payment_id: latestPayment.id,
                amount: latestPayment.amount,
                currency: latestPayment.currency,
                created_at: latestPayment.created_at,
                method: latestPayment.method,
                card: latestPayment.card,
              },
            });
          }
        }

        // If no payment records found, update user status
        console.log("No payment records found, updating user status");
        await db
          .update(USER_TABLE)
          .set({
            is_member: false,
            credits: 5, // Reset to default credits
            subscription_id: null,
          })
          .where(eq(USER_TABLE.email, email))
          .returning();

        return NextResponse.json(
          {
            error: "No active subscription found",
            details: "Your subscription has expired or was cancelled",
            customerId: user[0].customerId,
          },
          { status: 404 }
        );
      }

      // Find the most recent active subscription
      const subscription = customerSubscriptions
        .filter(
          (sub) =>
            sub.status === "active" ||
            sub.status === "created" ||
            sub.status === "authenticated"
        )
        .sort((a, b) => b.created_at - a.created_at)[0];

      if (!subscription) {
        console.log(
          "No active or created subscription found in items:",
          customerSubscriptions.map((s) => ({ id: s.id, status: s.status }))
        );
        return NextResponse.json(
          {
            error: "No active subscription found",
            details: "Your subscription is not active",
            customerId: user[0].customerId,
            availableStatuses: customerSubscriptions.map((s) => s.status),
          },
          { status: 404 }
        );
      }

      console.log(
        "Active subscription:",
        JSON.stringify(subscription, null, 2)
      );

      // Store subscription ID in database if not already stored
      if (!user[0].subscription_id) {
        console.log("Storing subscription ID in database");
        await db
          .update(USER_TABLE)
          .set({
            subscription_id: subscription.id,
            is_member: true,
          })
          .where(eq(USER_TABLE.email, email))
          .returning();
      }

      if (action === "cancel") {
        console.log("Cancelling subscription:", subscription.id);
        await razorpay.subscriptions.cancel(subscription.id);
        console.log("Subscription cancelled successfully");

        // Update user's membership status
        await db
          .update(USER_TABLE)
          .set({
            is_member: false,
            credits: 5, // Reset to default credits
            subscription_id: null,
          })
          .where(eq(USER_TABLE.email, email))
          .returning();
        console.log("User membership status updated successfully");

        return NextResponse.json({
          success: true,
          message: "Subscription cancelled successfully",
        });
      } else if (action === "get") {
        console.log("Returning subscription details");
        return NextResponse.json({
          success: true,
          subscription: {
            id: subscription.id,
            status: subscription.status,
            current_start: subscription.current_start,
            current_end: subscription.current_end,
            total_count: subscription.total_count,
            paid_count: subscription.paid_count,
            created_at: subscription.created_at,
            expire_by: subscription.expire_by,
            plan_id: subscription.plan_id,
            customer_id: subscription.customer_id,
            payment_id: subscription.payment_id,
            short_url: subscription.short_url,
          },
        });
      } else {
        console.error("Invalid action:", action);
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      }
    } catch (error) {
      console.error("Failed to fetch subscriptions:", {
        error: error.message,
        response: error.response?.data,
        status: error.statusCode,
        code: error.code,
        stack: error.stack,
        customerId: user[0].customerId,
        fullError: JSON.stringify(error, null, 2),
      });

      // Check if it's a customer not found error
      if (error.statusCode === 404) {
        return NextResponse.json(
          {
            error: "Customer not found",
            details: "Your payment account could not be found",
            customerId: user[0].customerId,
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          error: "Failed to fetch subscription details",
          details: error.response?.data || error.message,
          customerId: user[0].customerId,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Subscription management error:", {
      error: error,
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      statusCode: error.statusCode,
      code: error.code,
    });
    return NextResponse.json(
      {
        error: error.message || "Failed to manage subscription",
        details: error.response?.data || "No additional details available",
      },
      { status: 500 }
    );
  }
}
