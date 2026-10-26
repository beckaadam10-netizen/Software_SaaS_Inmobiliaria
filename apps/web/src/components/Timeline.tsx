import { fmtDateTime } from "@/lib/labels";

export type TimelineItem = { id: string; description: string; createdAt: string; user: { fullName: string } | null };

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return <p className="text-sm text-ink/65">Aún no hay actividad registrada.</p>;
  return (
    <ol className="relative ml-1.5 border-l-2 border-ink/10">
      {items.map((a) => (
        <li key={a.id} className="relative pb-4 pl-5 last:pb-0">
          <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-brand-teal ring-2 ring-white" aria-hidden />
          <p className="text-sm text-ink">{a.description}</p>
          <p className="text-xs text-ink/65">
            {fmtDateTime(a.createdAt)} · {a.user?.fullName ?? "Portal público"}
          </p>
        </li>
      ))}
    </ol>
  );
}
