"use client";
import { CourseCountContext } from "@/app/_context/CourseCountContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LayoutDashboard, Shield, UserCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useContext, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { db } from "@/configs/db";
import { USER_TABLE } from "@/configs/schema";
import { eq } from "drizzle-orm";
import { MenuList } from "./MenuList";

function SideBar() {
  const { totalCourse, setTotalCourse } = useContext(CourseCountContext);
  const path = usePathname();
  const { user } = useUser();
  const [userDetail, setUserDetail] = useState(null);

  useEffect(() => {
    const getUserDetail = async () => {
      if (user?.primaryEmailAddress?.emailAddress) {
        const result = await db
          .select()
          .from(USER_TABLE)
          .where(eq(USER_TABLE.email, user.primaryEmailAddress.emailAddress));

        if (result && result.length > 0) {
          setUserDetail(result[0]);
        }
      }
    };

    getUserDetail();
  }, [user]);

  return (
    <div className="h-screen shadow-md p-5">
      <div className="flex gap-2 items-center">
        <Image src="/RiseLogo.svg" alt="logo" width={230} height={230} />
      </div>

      <div className="mt-10">
        <Link href={"/create"} className="w-full">
          <Button className="w-full">+ Create New</Button>
        </Link>

        <div className="mt-5">
          {MenuList.map((menu, index) => (
            <Link href={menu.path} key={index}>
              <div
                className={`flex gap-5 items-center p-3
                        hover:bg-[#d5ebf6] rounded-lg cursor-pointer mt-3
                        ${path == menu.path && "bg-[#d5ebf6]"}`}
              >
                <menu.icon />
                <h2>{menu.name}</h2>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div
        className="border p-3 bg-[#d5ebf6] rounded-lg
            absolute bottom-10 w-[85%]"
      >
        <h2 className="text-md mb-5">
          Available Credits :{" "}
          {userDetail?.is_member ? "Unlimited" : `${5 - totalCourse}`}
        </h2>
        <Progress value={userDetail?.is_member ? 0 : (totalCourse / 5) * 100} />
        <h2 className="text-sm mt-5">
          {userDetail?.is_member
            ? "Unlimited Credits Available"
            : `${totalCourse} Out of 5 Credits Used`}
        </h2>

        {!userDetail?.is_member && (
          <Link
            href={"/dashboard/upgrade"}
            className="text-primary text-xs mt-5"
          >
            Upgrade to create more
          </Link>
        )}
      </div>
    </div>
  );
}

export default SideBar;
