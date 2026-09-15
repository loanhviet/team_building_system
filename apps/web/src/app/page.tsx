"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Journey } from "@/types/api";

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const isEmployee = !!user && user.role !== "organizer" && user.role !== "super_admin";

  const { data: journey, isFetched } = useQuery({
    queryKey: ["journey", "me"],
    queryFn: () => apiFetch<Journey>("/api/journey/me"),
    enabled: isEmployee,
    retry: false,
    throwOnError: false,
  });

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isEmployee) {
      router.replace("/admin");
      return;
    }
    if (!isFetched) return;
    router.replace(journey ? "/journey" : "/register");
  }, [isLoading, user, isEmployee, isFetched, journey, router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-muted-foreground">Đang tải...</p>
    </div>
  );
}
