import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("er_token");
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("er_token", token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("er_token");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function scoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
  if (score >= 60) return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
  if (score >= 40) return "bg-orange-500/15 text-orange-300 border border-orange-500/30";
  return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
}

export function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  return "Below Average";
}

export function riskColor(level: string): string {
  switch (level) {
    case "clean": return "text-emerald-400";
    case "low_risk": return "text-sky-400";
    case "moderate_risk": return "text-amber-400";
    case "high_risk": return "text-orange-400";
    case "very_high_risk": return "text-rose-400";
    default: return "text-gray-400";
  }
}

export function riskLabel(level: string): string {
  return level.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function roleLabel(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function roleColor(role: string): string {
  switch (role) {
    case "admin": return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
    case "company_admin": return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    case "hiring_manager": return "bg-sky-500/15 text-sky-300 border border-sky-500/30";
    case "recruiter": return "bg-brand/15 text-brand-light border border-brand/30";
    case "candidate": return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    default: return "bg-gray-500/15 text-gray-300 border border-gray-500/30";
  }
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
