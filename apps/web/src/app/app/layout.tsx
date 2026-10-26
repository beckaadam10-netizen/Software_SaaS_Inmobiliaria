import { PANEL_NAV, PANEL_SECTIONS, Shell } from "@/components/Shell";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <Shell nav={PANEL_NAV} sections={PANEL_SECTIONS} zone="tenant">{children}</Shell>;
}
