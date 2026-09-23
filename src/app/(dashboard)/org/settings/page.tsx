"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OrgSettingsGeneralPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/org/settings/members");
  }, [router]);

  return null;
}
