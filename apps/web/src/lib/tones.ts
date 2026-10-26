import type { Tone } from "@/components/ui";

export const PROPERTY_TONE: Record<string, Tone> = { AVAILABLE: "green", RESERVED: "amber", NEGOTIATING: "amber", SOLD: "dark", RENTED: "dark", INACTIVE: "neutral" };
export const VISIT_TONE: Record<string, Tone> = { REQUESTED: "lime", CONFIRMED: "teal", RESCHEDULED: "amber", DONE: "green", CANCELLED: "neutral", NO_SHOW: "red" };
export const CASE_TONE: Record<string, Tone> = { OPEN: "teal", WON: "green", LOST: "red" };
export const STAGE_TONE: Record<string, Tone> = { PENDING: "neutral", IN_PROGRESS: "lime", DONE: "green" };
export const TENANT_TONE: Record<string, Tone> = { ACTIVE: "green", SUSPENDED: "amber", CANCELLED: "neutral" };
export const OFFER_TONE: Record<string, Tone> = { PENDING: "lime", ACCEPTED: "green", REJECTED: "red", WITHDRAWN: "neutral" };
export const RESERVATION_TONE: Record<string, Tone> = { ACTIVE: "lime", CANCELLED: "neutral", APPLIED: "green" };
export const REFERRAL_TONE: Record<string, Tone> = { NEW: "lime", CONTACTED: "teal", CONVERTED: "green", DISCARDED: "neutral" };
export const CAMPAIGN_TONE: Record<string, Tone> = { PLANNED: "neutral", ACTIVE: "lime", FINISHED: "dark" };
export const ACCOUNT_TONE: Record<string, Tone> = { PENDING: "amber", PARTIAL: "lime", PAID: "green", CANCELLED: "neutral" };
export const COMMISSION_TONE: Record<string, Tone> = { GENERATED: "neutral", PENDING: "amber", APPROVED: "lime", PAID: "green", CANCELLED: "red" };
export const SETTLEMENT_TONE: Record<string, Tone> = { DRAFT: "neutral", APPROVED: "lime", PAID: "green" };
