/** Dirección pública de la foto de perfil; cambia con cada archivo para que el navegador no muestre una vieja. */
export const avatarUrl = (u: { id: string; avatarFile?: string | null }) => (u.avatarFile ? `/api/public/avatar/${u.id}?v=${u.avatarFile.slice(0, 8)}` : null);
