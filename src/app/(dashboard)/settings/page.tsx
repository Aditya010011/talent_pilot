"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProjectSettingsGeneralPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/api-keys");
  }, [router]);

  return null;
}
