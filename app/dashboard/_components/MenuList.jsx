import { LayoutDashboard, Shield, UserCircle } from "lucide-react";

export const MenuList = [
  {
    name: "Dashboard",
    icon: LayoutDashboard,
    path: "/dashboard",
  },
  {
    name: "Upgrade",
    icon: Shield,
    path: "/dashboard/upgrade",
  },
  {
    name: "Profile",
    icon: UserCircle,
    path: "/dashboard/profile",
  },
];
