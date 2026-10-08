"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, ErrorState, LoadingOverlay, EmptyState, Modal, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { NotificationItem, NotificationStats, JobApplication } from "@/types";
import { formatDate } from "@/lib/utils";
import { Bell, MapPin, Briefcase, Users, CloudUpload as UploadCloud } from "lucide-react";

export default function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"feed" | "applications">("feed");
  const [applyModal, setApplyModal] = useState<NotificationItem | null>(null);
  const [coverNote, setCoverNote] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [feed, s, myApps] = await Promise.all([
        api.notificationFeed(),
        api.notificationStats(),
        api.myApplications().catch(() => ({ total: 0, applications: [] as JobApplication[] })),
      ]);
      setItems(feed.notifications);
      setStats(s);
      setApps(myApps.applications);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load job board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApply = async () => {
    if (!applyModal || !resumeFile) return;
    setSubmitting(true);
    try {
      await api.apply(applyModal.id, applyModal.position_title, applyModal.company, coverNote, resumeFile);
      setApplyModal(null);
      setCoverNote("");
      setResumeFile(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Application failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <AppShell><LoadingOverlay message="Loading job board..." /></AppShell>;
  if (error && items.length === 0) return <AppShell><ErrorState message={error} onRetry={load} /></AppShell>;

  const statCards = [
    { label: "Companies", value: stats?.total_companies ?? 0, icon: Briefcase },
    { label: "Positions", value: stats?.total_positions ?? 0, icon: Bell },
    { label: "Openings", value: stats?.total_openings ?? 0, icon: Users },
  ];

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-100">Job Board</h1>
        <p className="mt-1 text-sm text-gray-500">Live job openings from partner companies</p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <s.icon className="mb-2 h-5 w-5 text-brand-light" />
            <p className="font-display text-xl font-bold text-gray-100">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        <Button variant={tab === "feed" ? "primary" : "outline"} size="sm" onClick={() => setTab("feed")}>Job Openings</Button>
        <Button variant={tab === "applications" ? "primary" : "outline"} size="sm" onClick={() => setTab("applications")}>My Applications ({apps.length})</Button>
      </div>

      {tab === "feed" ? (
        items.length === 0 ? (
          <EmptyState title="No openings" description="Check back later for new positions." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((n) => (
              <Card key={n.id}>
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-base font-semibold text-gray-100">{n.position_title}</h3>
                    <p className="text-sm text-gray-400">{n.company}</p>
                  </div>
                  {n.openings > 0 && (
                    <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{n.openings} openings</Badge>
                  )}
                </div>
                <div className="mb-3 flex flex-wrap gap-2 text-xs text-gray-500">
                  {n.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {n.location}</span>}
                  {n.job_type && <span>{n.job_type}</span>}
                  {n.eligibility && <span>· {n.eligibility}</span>}
                  <span>· {formatDate(n.posted_date)}</span>
                </div>
                {n.already_applied && n.already_applied.length > 0 && (
                  <Badge className="bg-bg-elevated text-gray-400 border border-bg-border">Already Applied</Badge>
                )}
                {user?.role === "candidate" && (
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => setApplyModal(n)}
                    disabled={n.already_applied && n.already_applied.length > 0}
                  >
                    Apply Now
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )
      ) : (
        apps.length === 0 ? (
          <EmptyState title="No applications yet" description="Apply to jobs from the Job Openings tab." />
        ) : (
          <div className="space-y-3">
            {apps.map((a) => (
              <Card key={a.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-100">{a.position_title}</p>
                    <p className="text-sm text-gray-500">{a.company} · {formatDate(a.created_at)}</p>
                  </div>
                  <Badge className="bg-bg-elevated text-gray-400 border border-bg-border">{a.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      <Modal open={!!applyModal} onClose={() => setApplyModal(null)} title={`Apply: ${applyModal?.position_title ?? ""}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-400">{applyModal?.company}</p>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-bg-border bg-bg-elevated px-6 py-8 text-center transition-colors hover:border-brand">
            <UploadCloud className="mb-2 h-8 w-8 text-gray-500" />
            <p className="text-sm text-gray-300">{resumeFile ? resumeFile.name : "Select your resume (PDF/DOCX)"}</p>
            <input type="file" accept=".pdf,.docx,.doc" onChange={(e) => setResumeFile(e.target.files?.[0] || null)} className="hidden" />
          </label>
          <Textarea
            label="Cover Note (optional)"
            value={coverNote}
            onChange={(e) => setCoverNote(e.target.value)}
            rows={3}
            placeholder="Why are you a good fit?"
          />
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleApply} loading={submitting} disabled={!resumeFile}>Submit Application</Button>
            <Button variant="outline" onClick={() => setApplyModal(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
