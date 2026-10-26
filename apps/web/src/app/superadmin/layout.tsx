import { ADMIN_NAV, ADMIN_SECTIONS, Shell } from "@/components/Shell";

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  return <Shell nav={ADMIN_NAV} sections={ADMIN_SECTIONS} zone="platform">{children}</Shell>;
}
