import { EmployeeShell } from "@/components/domain/employee-shell";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <EmployeeShell>{children}</EmployeeShell>;
}
