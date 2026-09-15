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
    <div className="grid min-h-svh flex-1 lg:grid-cols-[minmax(16rem,28rem)_1fr]">
      <aside className="hidden flex-col justify-between bg-[var(--night)] p-8 text-[var(--on-night)] lg:flex">
        <BrandMark light />
        <ul className="flex flex-col gap-5 text-sm leading-relaxed text-[var(--on-night)]/85">
          <li>
            <p className="font-medium text-[var(--on-night)]">CBNV</p>
            <p>Xem chuyến bay, xe, phòng, ghế Gala của mình trên một màn hình.</p>
          </li>
          <li>
            <p className="font-medium text-[var(--on-night)]">BTC</p>
            <p>Phân bổ nguồn lực, công bố thông tin, điều phối Gala.</p>
          </li>
        </ul>
        <p className="text-xs text-[var(--on-night)]/60">Tài khoản do công ty cấp. Không công khai.</p>
      </aside>

      <main className="flex items-center justify-center bg-background p-6">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex w-full max-w-sm flex-col gap-5"
        >
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Đăng nhập</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Email công ty và mật khẩu BTC đã cấp.
            </p>
          </div>
          {loginError && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
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
              className="min-h-11"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                className="min-h-11 pr-11"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting} className="min-h-11 w-full">
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
          <p className="text-xs text-muted-foreground">Quên mật khẩu — liên hệ BTC để cấp lại.</p>
        </form>
      </main>
    </div>
  );
}
