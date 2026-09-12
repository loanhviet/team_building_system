"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BrandMark } from "@/components/domain/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
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
      const message = err instanceof ApiError ? err.message : "Đăng nhập thất bại";
      toast.error(message);
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting} className="self-start px-5">
              {isSubmitting ? "Đang đăng nhập..." : "Vào cổng"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
