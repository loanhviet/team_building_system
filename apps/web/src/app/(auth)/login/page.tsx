"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
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

const HIGHLIGHTS = [
  {
    title: "Cả kỳ trên một màn",
    body: "Chuyến bay, xe, phòng, ghế Gala và lịch trình — đúng của bạn.",
  },
  {
    title: "Đăng ký trước hạn",
    body: "Ca bay, nhu cầu xe, điểm đón. BTC phân bổ theo slot thật.",
  },
  {
    title: "Hỏi đáp đúng nguồn",
    body: "Trợ lý đọc hành trình và tài liệu BTC đã công bố, không đoán.",
  },
];

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
    <div className="grid min-h-svh flex-1 bg-background lg:grid-cols-2">
      <aside className="login-panel relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <BrandMark light />
        <div className="max-w-md">
          <p className="text-xs font-semibold tracking-wide text-white/70">Cổng điều phối nội bộ</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-white">
            Team Building — một cổng cho cả chuyến đi
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            CBNV tự phục vụ hành trình. BTC điều phối nguồn lực, công bố thông tin, chạy Gala.
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3 text-sm text-white/85">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal-200" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-0.5 text-white/75">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/55">Tài khoản do công ty cấp. Không công khai.</p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex w-full max-w-md animate-in flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] fade-in slide-in-from-bottom-2 duration-300 sm:p-8"
        >
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Đăng nhập cổng nội bộ</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Email công ty và mật khẩu BTC đã cấp.
            </p>
          </div>
          {loginError && (
            <div
              role="alert"
              className="animate-in rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive fade-in slide-in-from-top-1 duration-200"
            >
              {loginError}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email / mã nhân viên</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              aria-invalid={!!errors.email}
              placeholder="vd. nv010@teambuilding.vn"
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
                className="pr-11"
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
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập ngay"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Quên mật khẩu — liên hệ BTC / IT Desk để cấp lại.
          </p>
        </form>
      </main>
    </div>
  );
}
