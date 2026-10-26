import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Valida la entrada con Zod y devuelve un 400 legible si no cumple. */
export function validate<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.join('.');
  throw new BadRequestException(field ? `Dato inválido en "${field}": ${issue.message}` : issue.message);
}

export const text = (max = 191) => z.string().trim().min(1).max(max);
export const optText = (max = 191) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullish());
export const optEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().toLowerCase().pipe(z.email()).nullish(),
);
export const optId = z.preprocess((v) => (v === '' ? null : v), z.string().max(40).nullish());
export const optInt = (min = 0, max = 100000) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().min(min).max(max).nullish());
export const optNumber = (min = 0, max = 1e12) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(min).max(max).nullish());
export const money = z.coerce.number().positive().max(1e11);
export const currency = z.enum(['USD', 'BOB']);
export const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200);

/** Quita las claves undefined para no pisar campos en un PATCH. */
export function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
