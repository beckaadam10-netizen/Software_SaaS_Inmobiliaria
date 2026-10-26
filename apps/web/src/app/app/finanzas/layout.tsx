import { FinanceTabs } from "@/components/FinanceTabs";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FinanceTabs />
      {children}
    </>
  );
}
