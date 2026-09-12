"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BrandMark } from "@/components/domain/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setLoginError(null);
    try {
      const user = await login(values.email, values.password);
      if (user.must_change_password) {
        router.push("/account");
        return;
      }
      if (user.role === "organizer" || user.role === "super_admin") {
        router.push("/admin");
      } else {
        router.push("/");
      }
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : "Đăng nhập thất bại");
    }
  };

  return (
    <div className="grid min-h-svh flex-1 lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="pass-hero relative hidden flex-col justify-between p-10 lg:flex">
        <BrandMark light />
        <div className="max-w-md">
          <p className="font-display text-4xl leading-tight font-semibold">
            Một cổng cho cả hành trình
          </p>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Đăng ký, chuyến bay, xe đưa đón, phòng khách sạn, ghế Gala — xem trên cùng một thẻ, không
            còn hỏi BTC từng tin nhắn.
          </p>
        </div>
        <div className="pass-stack" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </aside>

      <main className="flex items-center justify-center bg-[var(--foam)] p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="ticket w-full max-w-md">
          <div className="ticket-spine" />
          <div className="ticket-body flex flex-col gap-5 py-7">
            <div className="lg:hidden">
              <BrandMark />
            </div>
            <div>
              <p className="ticket-kicker">Cổng nội bộ</p>
              <h1 className="font-display text-2xl font-semibold">Đăng nhập</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Dùng email công ty BTC đã cấp tài khoản.
              </p>
            </div>
            {loginError && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {loginError}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  className="pr-10"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting} className="self-start px-5">
              {isSubmitting ? "Đang đăng nhập..." : "Vào cổng"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Quên mật khẩu? Liên hệ BTC để được cấp lại.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
