/** Tipo de cambio: bolivianos por 1 dólar. Los montos se guardan en su moneda; la conversión es solo para mostrar. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Tipo de cambio vigente en una fecha: el último registrado en esa fecha o antes. */
export function rateOn<T extends { date: Date; rate: number }>(rates: T[], date: Date): T | null {
  return rates.filter((r) => r.date.getTime() <= date.getTime()).sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null;
}

export const toBOB = (amount: number, currency: string, rate: number) => round2(currency === 'USD' ? amount * rate : amount);

/** Suma montos en distintas monedas, expresada en bolivianos. */
export function totalInBOB(byCurrency: Record<string, number>, rate: number) {
  return round2(Object.entries(byCurrency).reduce((s, [cur, n]) => s + toBOB(n, cur, rate), 0));
}
