"use client";

import { cn } from "@/lib/utils";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";
import { X, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

// Button
type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-bg-elevated text-gray-200 hover:bg-bg-border border border-bg-border",
  outline: "border border-bg-border text-gray-300 hover:bg-bg-elevated",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  ghost: "text-gray-400 hover:text-gray-200 hover:bg-bg-elevated",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
        buttonVariants[variant], buttonSizes[size], className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

// Input
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}
export function Input({ label, className, ...props }: InputProps) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-medium text-gray-300">{label}</label>}
      <input
        className={cn(
          "w-full rounded-lg border border-bg-border bg-bg-elevated px-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:border-brand focus:outline-none transition-colors",
          className,
        )}
        {...props}
      />
    </div>
  );
}

// Textarea
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}
export function Textarea({ label, className, ...props }: TextareaProps) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-medium text-gray-300">{label}</label>}
      <textarea
        className={cn(
          "w-full rounded-lg border border-bg-border bg-bg-elevated px-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:border-brand focus:outline-none transition-colors resize-y",
          className,
        )}
        {...props}
      />
    </div>
  );
}

// Select
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}
export function Select({ label, className, children, ...props }: SelectProps) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-medium text-gray-300">{label}</label>}
      <select
        className={cn(
          "w-full rounded-lg border border-bg-border bg-bg-elevated px-4 py-2.5 text-sm text-gray-100 focus:border-brand focus:outline-none transition-colors",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

// Card
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-bg-border bg-bg-surface p-6", className)}>
      {children}
    </div>
  );
}

// Badge
export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

// LoadingOverlay
export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {message && <p className="mt-3 text-sm text-gray-400">{message}</p>}
    </div>
  );
}

// ErrorState
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertCircle className="h-10 w-10 text-rose-400" />
      <p className="mt-3 max-w-md text-sm text-gray-400">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try Again</Button>
      )}
    </div>
  );
}

// EmptyState
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="font-display text-lg font-semibold text-gray-300">{title}</p>
      {description && <p className="mt-2 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Modal
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-bg-border bg-bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-gray-100">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-bg-elevated hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ScoreRing
export function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circumference - (pct / 100) * circumference;
  const color = score >= 80 ? "#34d399" : score >= 60 ? "#fbbf24" : score >= 40 ? "#fb923c" : "#fb7185";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#243044" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.7s ease" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-2xl font-bold" style={{ color }}>{Math.round(score)}</span>
      </div>
    </div>
  );
}

// ScoreBar
export function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : pct >= 40 ? "bg-orange-500" : "bg-rose-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono text-gray-300">{Math.round(pct)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg-border">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// LogoutButton helper
export function LogoutButton() {
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" onClick={async () => { await import("@/lib/auth-context").then(m => m.useAuth().logout()); router.push("/login"); }}>
      Sign Out
    </Button>
  );
}
