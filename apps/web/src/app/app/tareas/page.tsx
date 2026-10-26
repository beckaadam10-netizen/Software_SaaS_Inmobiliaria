"use client";

import { useState, type FormEvent } from "react";
import { canAssignAgents, isBranchManager, useSession } from "@/components/Shell";
import { Badge, Button, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select, Textarea, type Tone } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { fmtDateTime, TASK_PRIORITY, TASK_TYPE, toLocalInput } from "@/lib/labels";

type Task = {
  id: string; title: string; type: string; priority: string; status: "PENDING" | "DONE"; dueAt: string | null; notes: string | null; automatic: boolean;
  completedAt: string | null; assignedTo: { id: string; fullName: string };
};
const PRIORITY_TONE: Record<string, Tone> = { LOW: "neutral", MEDIUM: "teal", HIGH: "amber", URGENT: "red" };

function TaskForm({ initial, onDone, onCancel }: { initial?: Task; onDone: () => void; onCancel: () => void }) {
  const me = useSession();
  const people = useFetch<Array<{ id: string; fullName: string }>>(canAssignAgents(me) ? "/users/agents" : null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = formData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api(initial ? `/tasks/${initial.id}` : "/tasks", { method: initial ? "PATCH" : "POST", json: { ...data, dueAt: data.dueAt ? new Date(data.dueAt).toISOString() : "" } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Qué hay que hacer" className="sm:col-span-2"><Input name="title" required maxLength={190} defaultValue={initial?.title} /></Field>
      <Field label="Tipo"><Select name="type" options={TASK_TYPE} defaultValue={initial?.type ?? "CALL"} /></Field>
      <Field label="Prioridad"><Select name="priority" options={TASK_PRIORITY} defaultValue={initial?.priority ?? "MEDIUM"} /></Field>
      <Field label="Fecha límite"><Input name="dueAt" type="datetime-local" defaultValue={initial?.dueAt ? toLocalInput(initial.dueAt) : ""} /></Field>
      {canAssignAgents(me) && (
        <Field label="Responsable">
          <Select name="assignedToId" options={(people.data ?? []).map((p) => [p.id, p.fullName])} placeholder="Yo" defaultValue={initial?.assignedTo.id ?? ""} />
        </Field>
      )}
      <Field label="Notas" className="sm:col-span-2"><Textarea name="notes" maxLength={2000} defaultValue={initial?.notes ?? ""} /></Field>
      <div className="sm:col-span-2">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} />
      </div>
    </form>
  );
}

export default function TasksPage() {
  const me = useSession();
  const [filter, setFilter] = useState<"PENDING" | "DONE">("PENDING");
  const state = useFetch<Task[]>(`/tasks?status=${filter}`);
  const [modal, setModal] = useState<{ task?: Task } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Se fija al abrir la pantalla para saber qué tareas ya vencieron.
  const [now] = useState(() => Date.now());

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <PageHeader title="Tareas" subtitle={me.role === "ADMIN" ? "Pendientes de todo el equipo. Las automáticas las crea el sistema." : isBranchManager(me) ? "Pendientes de tu sucursal. Las automáticas las crea el sistema." : "Tus pendientes. Las automáticas las crea el sistema."}>
        <div className="flex rounded-lg ring-1 ring-ink/20" role="group" aria-label="Filtro">
          {(["PENDING", "DONE"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`h-10 px-4 text-sm font-semibold first:rounded-l-lg last:rounded-r-lg ${filter === f ? "bg-brand-deep text-on-brand" : "bg-white text-ink hover:bg-ink/5"}`}>
              {f === "PENDING" ? "Pendientes" : "Hechas"}
            </button>
          ))}
        </div>
        <Button onClick={() => setModal({})}>Nueva tarea</Button>
      </PageHeader>
      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={state}>
        {(tasks) =>
          tasks.length === 0 ? <Empty title={filter === "PENDING" ? "No hay tareas pendientes" : "Aún no hay tareas completadas"}>Crea una tarea o espera a que el sistema las genere al llegar un lead o realizarse una visita.</Empty> : (
            <ul className="flex flex-col gap-2">
              {tasks.map((t) => {
                const late = t.status === "PENDING" && t.dueAt && new Date(t.dueAt).getTime() < now;
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink/10">
                    <input
                      type="checkbox" checked={t.status === "DONE"} aria-label={`Marcar "${t.title}" como ${t.status === "DONE" ? "pendiente" : "hecha"}`}
                      onChange={() => act(() => api(`/tasks/${t.id}`, { method: "PATCH", json: { status: t.status === "DONE" ? "PENDING" : "DONE" } }))}
                      className="h-5 w-5 shrink-0 accent-brand-teal"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold text-ink ${t.status === "DONE" ? "line-through opacity-60" : ""}`}>{t.title}</p>
                      <p className="text-sm text-ink/70">
                        {TASK_TYPE[t.type]} · {t.assignedTo.fullName}
                        {t.dueAt && <> · <span className={late ? "font-semibold text-danger" : ""}>{late ? "Venció " : "Vence "}{fmtDateTime(t.dueAt)}</span></>}
                      </p>
                      {t.notes && <p className="mt-0.5 text-sm text-ink/70">{t.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {t.automatic && <Badge tone="lime">Automática</Badge>}
                      <Badge tone={PRIORITY_TONE[t.priority]}>{TASK_PRIORITY[t.priority]}</Badge>
                      <Button small variant="ghost" onClick={() => setModal({ task: t })}>Editar</Button>
                      <Button small variant="danger" onClick={() => act(() => api(`/tasks/${t.id}`, { method: "DELETE" }))}>Eliminar</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        }
      </Loader>
      {modal && (
        <Modal title={modal.task ? "Editar tarea" : "Nueva tarea"} onClose={() => setModal(null)}>
          <TaskForm initial={modal.task} onCancel={() => setModal(null)} onDone={() => { setModal(null); state.reload(); }} />
        </Modal>
      )}
    </>
  );
}
