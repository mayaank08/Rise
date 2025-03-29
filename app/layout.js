import { Audiowide } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import Provider from "./provider";
import { Toaster } from "@/components/ui/toaster";

const audioWide = Audiowide({
  variable: "--font-audiowide",
  subsets: ["latin"],
  weight: "400",
});

export const metadata = {
  title: "rise - Your Learning Platform",
  description: "Learn and grow with rise",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        </head>
        <body
          className={audioWide.className} // Applying the Audiowide font globally
        >
          <Provider>
            <main>{children}</main>
            <Toaster />
          </Provider>
        </body>
      </html>
    </ClerkProvider>
  );
}

{
  /*When you define a RootLayout in layout.js, it acts as a wrapper for the pages defined in page.js.
In Next.js 13 (and later), each page.js is automatically considered a child of the RootLayout.*/
}
