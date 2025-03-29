import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/configs/db";
import { USER_TABLE } from "@/configs/schema";
import { eq } from "drizzle-orm";

export async function POST(req) {
  try {
    console.log("POST /api/payment/checkout reached");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { priceId, email } = await req.json();

    // Get user from database
    const user = await db
      .select()
      .from(USER_TABLE)
      .where(eq(USER_TABLE.email, email));

    if (!user || user.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let customerId = user[0].customerId;

    // If user doesn't have a Stripe customer ID, create one
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          userId: user[0].id.toString(),
        },
      });
      customerId = customer.id;

      // Update user with new customer ID
      await db
        .update(USER_TABLE)
        .set({ customerId: customerId })
        .where(eq(USER_TABLE.id, user[0].id));
    }

    // Create checkout session with customer ID
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url:
        process.env.HOST_URL +
        "payment-success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: process.env.HOST_URL,
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
