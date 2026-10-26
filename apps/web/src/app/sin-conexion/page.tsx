export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-bold text-ink">No hay conexión a internet</h1>
      <p className="max-w-sm text-ink/75">Soft_Inmo necesita conexión para mostrar tus datos. Revisa tu wifi o tus datos móviles y vuelve a intentarlo.</p>
      <a href="/app" className="mt-2 inline-flex h-10 items-center rounded-lg bg-brand-teal px-4 text-sm font-semibold text-on-brand">Reintentar</a>
    </main>
  );
}
