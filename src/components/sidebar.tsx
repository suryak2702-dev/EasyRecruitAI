"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import { LayoutDashboard, Briefcase, FileText, Users, MessageSquare, ShieldAlert, Scale, Bell, Settings, User as UserIcon, LogOut } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase, roles: ["recruiter", "hiring_manager", "admin", "company_admin"] },
  { href: "/analysis", label: "Resume Analysis", icon: FileText, roles: ["recruiter", "hiring_manager", "admin", "company_admin"] },
  { href: "/candidates", label: "Candidates", icon: Users, roles: ["recruiter", "hiring_manager", "admin", "company_admin"] },
  { href: "/interviews", label: "Interviews", icon: MessageSquare },
  { href: "/fraud", label: "Fraud Detection", icon: ShieldAlert, roles: ["recruiter", "hiring_manager", "admin", "company_admin"] },
  { href: "/bias", label: "Bias-Free Hiring", icon: Scale, roles: ["recruiter", "hiring_manager", "admin", "company_admin"] },
  { href: "/notifications", label: "Job Board", icon: Bell },
  { href: "/profile", label: "Profile", icon: UserIcon },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin", "company_admin"] },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, hasRole, logout } = useAuth();

  const filtered = navItems.filter((item) => !item.roles || hasRole(...item.roles));

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-bg-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-light">
          <span className="font-display text-lg font-bold text-white">E</span>
        </div>
        <span className="font-display text-lg font-bold text-gray-100">EasyRecruit</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {filtered.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-brand/10 text-brand-light" : "text-gray-400 hover:bg-bg-elevated hover:text-gray-200",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-bg-border p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand-light">
            {(user?.full_name || user?.email || "?")[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-200">{user?.full_name || user?.username}</p>
            <p className="truncate text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </div>
  );
}
