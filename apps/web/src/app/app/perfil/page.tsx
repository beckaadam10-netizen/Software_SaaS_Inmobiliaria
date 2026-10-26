"use client";

import { useState } from "react";
import { AvatarUpload } from "@/components/AvatarUpload";
import { useSession } from "@/components/Shell";
import { Card, PageHeader } from "@/components/ui";
import { ROLE } from "@/lib/labels";
import { reloadView } from "@/lib/reload";

/** Perfil de la persona que inició sesión: su foto, que el portal muestra en las propiedades que atiende. */
export default function ProfilePage() {
  const user = useSession();
  const [avatar, setAvatar] = useState(user.avatar ?? null);
  return (
    <>
      <PageHeader title="Mi perfil" subtitle="Tu foto aparece en el portal, en la ficha de cada propiedad que atiendes y en tus reseñas." />
      <Card className="max-w-2xl">
        <p className="text-lg font-bold text-ink">{user.fullName}</p>
        <p className="mb-5 text-sm text-ink/70">{ROLE[user.role]} · {user.email}</p>
        <AvatarUpload name={user.fullName} src={avatar} path="/me/avatar" onChange={(a) => { setAvatar(a); reloadView(); }} />
      </Card>
    </>
  );
}
