"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, Button, Badge, ErrorState, LoadingOverlay, EmptyState, Modal, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { User, AdminStats, TeamData } from "@/types";
import { formatDate, roleColor, roleLabel } from "@/lib/utils";
import { Settings, Users, CheckCircle, XCircle, Trash2, Power } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isCompanyAdmin = user?.role === "company_admin" || isAdmin;

  const [tab, setTab] = useState<"account" | "users" | "team">(isAdmin ? "users" : "account");
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (isAdmin) {
        const [u, s] = await Promise.all([api.adminUsers(), api.adminStats()]);
        setUsers(u);
        setStats(s);
      } else if (isCompanyAdmin) {
        const t = await api.team();
        setTeam(t);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isCompanyAdmin]);

  useEffect(() => {
    if (isCompanyAdmin) load();
    else setLoading(false);
  }, [load, isCompanyAdmin]);

  const handleToggle = async (id: number) => {
    try {
      await api.toggleUser(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to toggle user.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Permanently delete this user?")) return;
    try {
      await api.deleteUser(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete user.");
    }
  };

  const handleApprove = async (id: number) => {
    try { await api.approveUser(id); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Failed to approve."); }
  };

  const handleReject = async (id: number) => {
    try { await api.rejectUser(id); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Failed to reject."); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwLoading(true);
    setPwError("");
    setPwSuccess("");
    try {
      await api.changePassword(pwForm.current, pwForm.next);
      setPwSuccess("Password changed successfully.");
      setPwModal(false);
      setPwForm({ current: "", next: "" });
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : "Failed to change password.");
    } finally {
      setPwLoading(false);
    }
  };

  if (loading) return <AppShell><LoadingOverlay message="Loading settings..." /></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-100">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your account and administration</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {isCompanyAdmin && (
        <div className="mb-4 flex gap-2">
          <Button variant={tab === "account" ? "primary" : "outline"} size="sm" onClick={() => setTab("account")}>Account</Button>
          {isAdmin && <Button variant={tab === "users" ? "primary" : "outline"} size="sm" onClick={() => setTab("users")}>All Users</Button>}
          {isCompanyAdmin && <Button variant={tab === "team" ? "primary" : "outline"} size="sm" onClick={() => setTab("team")}>Team</Button>}
        </div>
      )}

      {tab === "account" && (
        <Card>
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Account Settings</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="text-sm text-gray-200">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Username</p>
              <p className="text-sm text-gray-200">{user?.username}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Role</p>
              <Badge className={roleColor(user?.role || "")}>{roleLabel(user?.role || "")}</Badge>
            </div>
            <Button variant="outline" onClick={() => setPwModal(true)}>Change Password</Button>
          </div>
        </Card>
      )}

      {tab === "users" && isAdmin && (
        <div>
          {stats && (
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card><p className="font-display text-2xl font-bold text-gray-100">{stats.total_users}</p><p className="text-xs text-gray-500">Total Users</p></Card>
              <Card><p className="font-display text-2xl font-bold text-gray-100">{stats.active_users}</p><p className="text-xs text-gray-500">Active</p></Card>
              <Card><p className="font-display text-2xl font-bold text-gray-100">{stats.total_analyses}</p><p className="text-xs text-gray-500">Analyses</p></Card>
              <Card><p className="font-display text-2xl font-bold text-gray-100">{stats.total_jobs}</p><p className="text-xs text-gray-500">Jobs</p></Card>
            </div>
          )}
          {users.length === 0 ? (
            <EmptyState title="No users" description="No registered users found." />
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <Card key={u.id}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-100">{u.full_name || u.username}</p>
                      <p className="truncate text-sm text-gray-500">{u.email}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge className={roleColor(u.role)}>{roleLabel(u.role)}</Badge>
                        <Badge className={u.is_active ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-gray-500/15 text-gray-400 border border-gray-500/30"}>
                          {u.is_active ? "Active" : "Disabled"}
                        </Badge>
                        <span className="text-xs text-gray-600">{formatDate(u.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {u.approval_status === "pending" && (
                        <>
                          <button onClick={() => handleApprove(u.id)} className="rounded-lg p-2 text-emerald-400 hover:bg-emerald-500/10"><CheckCircle className="h-4 w-4" /></button>
                          <button onClick={() => handleReject(u.id)} className="rounded-lg p-2 text-amber-400 hover:bg-amber-500/10"><XCircle className="h-4 w-4" /></button>
                        </>
                      )}
                      <button onClick={() => handleToggle(u.id)} className="rounded-lg p-2 text-sky-400 hover:bg-sky-500/10"><Power className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(u.id)} className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "team" && isCompanyAdmin && (
        <div>
          {team ? (
            <>
              <p className="mb-4 text-sm text-gray-500">{team.company} — {team.total} recruiter{team.total !== 1 ? "s" : ""}</p>
              {team.recruiters.length === 0 ? (
                <EmptyState title="No team members" description="No recruiters have registered for your company yet." />
              ) : (
                <div className="space-y-2">
                  {team.recruiters.map((r) => (
                    <Card key={r.id}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-100">{r.full_name || r.username}</p>
                          <p className="text-sm text-gray-500">{r.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={r.approval_status === "approved" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : r.approval_status === "pending" ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" : "bg-rose-500/15 text-rose-300 border border-rose-500/30"}>
                            {r.approval_status}
                          </Badge>
                          {r.approval_status === "pending" && (
                            <>
                              <button onClick={() => handleApprove(r.id)} className="rounded-lg p-2 text-emerald-400 hover:bg-emerald-500/10"><CheckCircle className="h-4 w-4" /></button>
                              <button onClick={() => handleReject(r.id)} className="rounded-lg p-2 text-amber-400 hover:bg-amber-500/10"><XCircle className="h-4 w-4" /></button>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyState title="No team data" description="No recruiters found for your company." />
          )}
        </div>
      )}

      <Modal open={pwModal} onClose={() => setPwModal(false)} title="Change Password">
        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwError && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{pwError}</div>}
          {pwSuccess && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{pwSuccess}</div>}
          <Input label="Current Password" type="password" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} required />
          <Input label="New Password" type="password" value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} required minLength={8} />
          <div className="flex gap-3">
            <Button type="submit" loading={pwLoading}>Change</Button>
            <Button type="button" variant="outline" onClick={() => setPwModal(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
