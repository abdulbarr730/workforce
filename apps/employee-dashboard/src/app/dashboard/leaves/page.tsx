"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Leave requests now live on the Requests page (with half days, attendance
// corrections and history). Old links land there.
export default function LeavesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/dashboard/requests${window.location.search}`);
  }, [router]);
  return null;
}
