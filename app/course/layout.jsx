import React from "react";
import DashboardHeader from "../dashboard/_components/DashboardHeader";
import Footer from "../dashboard/_components/Footer";

function CourseViewLayout({ children }) {
  return (
    <div>
      <DashboardHeader />
      <div className="mx-10 md:mx-36 lg:px-44 mt-10">{children}</div>
      <Footer />
    </div>
  );
}

{
  /*This layout wraps all dynamic course pages and automatically updates "children" when the route (course[id]) changes, keeping the header persistent.*/
}

export default CourseViewLayout;
