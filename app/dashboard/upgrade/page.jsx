"use client";
import { Button } from "@/components/ui/button";
import { db } from "@/configs/db";
import { USER_TABLE } from "@/configs/schema";
import { useUser } from "@clerk/nextjs";
import axios from "axios";
import { eq } from "drizzle-orm";
import React, { useEffect, useState } from "react";
import CheckIcon from "./_components/CheckIcon";
import { useToast } from "@/hooks/use-toast";

function Upgrade() {
  const { user, isLoaded } = useUser();
  const { toast } = useToast();
  const [userDetail, setUserDetail] = useState();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoaded && user) {
      console.log("User data from Clerk:", {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName,
        isLoaded,
        user: user,
      });
      GetUserDetail();
    }
  }, [isLoaded, user]);

  const GetUserDetail = async () => {
    try {
      console.log(
        "Getting user details for:",
        user?.primaryEmailAddress?.emailAddress
      );
      const result = await db
        .select()
        .from(USER_TABLE)
        .where(eq(USER_TABLE.email, user?.primaryEmailAddress?.emailAddress));

      console.log("User details from database:", result[0]);

      if (result && result.length > 0) {
        setUserDetail(result[0]);
      }
    } catch (error) {
      console.error("Error fetching user details:", error);
    }
  };

  const OnCheckoutClick = async () => {
    try {
      setLoading(true);

      // Debug logging
      console.log("Starting checkout process with user:", {
        isLoaded,
        user: user,
        email: user?.primaryEmailAddress?.emailAddress,
        name: user?.fullName,
      });

      // Check if user is loaded and has required data
      if (!isLoaded) {
        toast({
          title: "Loading",
          description: "Please wait while we load your profile...",
        });
        return;
      }

      if (!user) {
        toast({
          title: "Error",
          description: "Please sign in to continue.",
          variant: "destructive",
        });
        return;
      }

      // Check if user data is available
      if (!user.primaryEmailAddress?.emailAddress) {
        console.log("User profile incomplete:", {
          hasEmail: !!user.primaryEmailAddress?.emailAddress,
          hasName: !!user.fullName,
          email: user.primaryEmailAddress?.emailAddress,
          name: user.fullName,
        });
        toast({
          title: "Profile Incomplete",
          description:
            "Please add your email address in your account settings before proceeding.",
          variant: "destructive",
        });
        return;
      }

      // Create a new customer if one doesn't exist
      let customerId = userDetail?.customerId;
      if (!customerId) {
        try {
          const userEmail = user.primaryEmailAddress.emailAddress;
          const userName = user.fullName || "Anonymous User";

          console.log("Creating customer with:", {
            email: userEmail,
            name: userName,
          });

          const customerResponse = await axios.post(
            "/api/payment/razorpay/create-customer",
            {
              email: userEmail,
              name: userName,
            }
          );

          console.log("Customer creation response:", customerResponse.data);

          if (!customerResponse.data?.id) {
            throw new Error(
              "Failed to create customer: No customer ID received"
            );
          }

          customerId = customerResponse.data.id;

          // Update user details with the new customer ID
          await axios.post("/api/user/update-customer-id", {
            email: userEmail,
            customerId: customerId,
          });

          // Update local state
          setUserDetail((prev) => ({
            ...prev,
            customerId: customerId,
          }));
        } catch (error) {
          console.error("Customer creation error:", {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            details:
              error.response?.data?.details || error.response?.data?.error,
            stack: error.stack,
          });

          const errorMessage =
            error.response?.data?.details ||
            error.response?.data?.error ||
            error.message ||
            "Failed to create customer. Please try again.";

          toast({
            title: "Error",
            description: errorMessage,
            variant: "destructive",
          });

          return; // Stop the process here instead of throwing
        }
      }

      // Create Razorpay order
      const orderResponse = await axios.post(
        "/api/payment/razorpay/create-order",
        {
          amount: 999, // Amount in INR
          currency: "INR",
          customerId,
        }
      );

      if (!orderResponse.data?.id) {
        throw new Error("Failed to create order: No order ID received");
      }

      const options = {
        key: orderResponse.data.key,
        amount: orderResponse.data.amount,
        currency: orderResponse.data.currency,
        name: "Rise",
        description: "Premium Membership",
        order_id: orderResponse.data.id,
        customer_id: customerId,
        handler: async function (response) {
          try {
            // Verify payment
            console.log("Verifying payment with data:", {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              email: user?.primaryEmailAddress?.emailAddress,
            });

            const verifyResponse = await axios.post(
              "/api/payment/razorpay/verify",
              {
                email: user?.primaryEmailAddress?.emailAddress,
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }
            );

            console.log("Payment verification response:", verifyResponse.data);

            if (verifyResponse.data.success) {
              // Debug logging
              console.log(
                "Payment verified successfully, refreshing user details"
              );

              // Refresh user details
              GetUserDetail();

              toast({
                title: "Success!",
                description:
                  verifyResponse.data.message ||
                  "Your payment has been processed successfully.",
              });

              // If there's a warning about subscription creation, show it
              if (verifyResponse.data.warning) {
                toast({
                  title: "Warning",
                  description: verifyResponse.data.warning,
                  variant: "destructive",
                });
              }
            } else {
              throw new Error(
                verifyResponse.data.error || "Payment verification failed"
              );
            }
          } catch (error) {
            console.error("Payment verification error:", {
              message: error.message,
              response: error.response?.data,
              status: error.response?.status,
              details: error.response?.data?.details,
              stack: error.stack,
            });

            toast({
              title: "Error",
              description:
                error.response?.data?.details ||
                error.response?.data?.error ||
                error.message ||
                "Failed to verify payment. Please contact support.",
              variant: "destructive",
            });
          }
        },
        prefill: {
          name: user?.fullName,
          email: user?.primaryEmailAddress?.emailAddress,
        },
        theme: {
          color: "#000000",
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error("Checkout error:", error);
      toast({
        title: "Error",
        description:
          error.message || "Failed to initiate payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onPaymentMange = async () => {
    try {
      // Debug logging
      console.log("Starting payment management with user details:", {
        email: user?.primaryEmailAddress?.emailAddress,
        customerId: userDetail?.customerId,
        isMember: userDetail?.is_member,
      });

      // Get subscription details
      const subscriptionResponse = await axios.post(
        "/api/payment/razorpay/manage-subscription",
        {
          email: user?.primaryEmailAddress?.emailAddress,
          action: "get",
        }
      );

      console.log("Subscription response:", subscriptionResponse.data);

      if (subscriptionResponse.data?.subscription) {
        const subscription = subscriptionResponse.data.subscription;

        // Show subscription details in a modal or dialog
        toast({
          title: "Subscription Details",
          description: `Status: ${
            subscription.status
          }\nNext billing: ${new Date(
            subscription.current_end * 1000
          ).toLocaleDateString()}`,
        });

        // Add a confirmation dialog for cancellation
        if (confirm("Would you like to cancel your subscription?")) {
          console.log("User confirmed subscription cancellation");
          const cancelResponse = await axios.post(
            "/api/payment/razorpay/manage-subscription",
            {
              email: user?.primaryEmailAddress?.emailAddress,
              action: "cancel",
            }
          );

          console.log("Cancel response:", cancelResponse.data);

          if (cancelResponse.data?.success) {
            toast({
              title: "Success",
              description: "Your subscription has been cancelled successfully.",
            });
            // Refresh user details
            GetUserDetail();
          }
        }
      } else {
        console.log("No subscription found, redirecting to payment page");
        // Redirect to payment page to create a new subscription
        window.location.href = "/dashboard/upgrade";
      }
    } catch (error) {
      console.error("Payment management error:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        details: error.response?.data?.error,
        stack: error.stack,
      });
      toast({
        title: "Error",
        description:
          error.response?.data?.error || "Failed to process payment request",
        variant: "destructive",
      });
    }
  };

  const handlePaymentSuccess = async (response) => {
    try {
      console.log("Payment success response:", response);

      // Verify the payment
      const verificationResponse = await axios.post(
        "/api/payment/razorpay/verify",
        {
          email: user?.primaryEmailAddress?.emailAddress,
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        }
      );

      console.log("Payment verification response:", verificationResponse.data);

      if (verificationResponse.data.success) {
        toast({
          title: "Success",
          description: verificationResponse.data.message,
        });

        // Refresh user details
        GetUserDetail();

        // If there's a warning about subscription creation, show it
        if (verificationResponse.data.warning) {
          toast({
            title: "Warning",
            description: verificationResponse.data.warning,
            variant: "destructive",
          });
        }
      } else {
        throw new Error(
          verificationResponse.data.error || "Payment verification failed"
        );
      }
    } catch (error) {
      console.error("Payment verification error:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        details: error.response?.data?.details,
        stack: error.stack,
      });
      toast({
        title: "Error",
        description:
          error.response?.data?.details ||
          error.response?.data?.error ||
          error.message ||
          "Failed to verify payment",
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <header className="font-medium text-3xl">Plans</header>
      <p>Update your plan to generate unlimted courses for your exam</p>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="grid md:grid-cols-2 md:gap-7 sm:grid-cols-1 sm:items-center sm:gap-4">
          <div className="rounded-2xl border border-gray-200 p-6 shadow-sm sm:px-8 lg:p-12">
            <div className="text-center">
              <h2 className="text-lg font-medium text-gray-900">
                Free
                <span className="sr-only">Plan</span>
              </h2>

              <p className="mt-2 sm:mt-4">
                <strong className="text-3xl font-bold text-gray-900 sm:text-4xl">
                  {" "}
                  0${" "}
                </strong>

                <span className="text-sm font-medium text-gray-700">
                  /month
                </span>
              </p>
            </div>

            <ul className="mt-6 space-y-2">
              <li className="flex items-center gap-1">
                <CheckIcon />
                <span className="text-gray-700"> 5 Course Generate </span>
              </li>

              <li className="flex items-center gap-1">
                <CheckIcon />
                <span className="text-gray-700"> Limited Support </span>
              </li>

              <li className="flex items-center gap-1">
                <CheckIcon />
                <span className="text-gray-700"> Email support </span>
              </li>

              <li className="flex items-center gap-1">
                <CheckIcon />
                <span className="text-gray-700"> Help center access </span>
              </li>
            </ul>

            <Button variant="ghost" className="w-full mt-5 text-primary">
              Current Plan
            </Button>
          </div>
          <div className="rounded-2xl border border-gray-200 p-6 shadow-sm sm:px-8 lg:p-12">
            <div className="text-center">
              <h2 className="text-lg font-medium text-gray-900">
                Montly
                <span className="sr-only">Plan</span>
              </h2>

              <p className="mt-2 sm:mt-4">
                <strong className="text-3xl font-bold text-gray-900 sm:text-4xl">
                  {" "}
                  9.99${" "}
                </strong>

                <span className="text-sm font-medium text-gray-700">
                  /Montly
                </span>
              </p>
            </div>

            <ul className="mt-6 space-y-2">
              <li className="flex items-center gap-1">
                <CheckIcon />
                <span className="text-gray-700">
                  {" "}
                  Unlimted Course Generate{" "}
                </span>
              </li>

              <li className="flex items-center gap-1">
                <CheckIcon />
                <span className="text-gray-700">
                  {" "}
                  Unlimted Flashcard, Quiz{" "}
                </span>
              </li>

              <li className="flex items-center gap-1">
                <CheckIcon />
                <span className="text-gray-700"> Email support </span>
              </li>

              <li className="flex items-center gap-1">
                <CheckIcon />
                <span className="text-gray-700"> Help center access </span>
              </li>
            </ul>

            {userDetail?.is_member ? (
              <Button onClick={onPaymentMange} className="w-full mt-5">
                Cancel Subscription
              </Button>
            ) : (
              <Button
                onClick={OnCheckoutClick}
                disabled={loading}
                className="w-full mt-5"
              >
                {loading ? "Processing..." : "Get Started - ₹999"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Upgrade;
