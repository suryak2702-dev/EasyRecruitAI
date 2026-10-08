"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, ScoreRing, ErrorState, LoadingOverlay } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AnalysisStats, AnalysisListItem } from "@/types";
import { formatDate, scoreColor, scoreLabel } from "@/lib/utils";
import { TrendingUp, Award, Activity, FileText } from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AnalysisStats | null>(null);
  const [recent, setRecent] = useState<AnalysisListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [s, r] = await Promise.all([
        api.analysisStats(),
        api.analysisList(1, 5),
      ]);
      setStats(s);
      setRecent(r.items);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load dashboard data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <AppShell><LoadingOverlay message="Loading dashboard..." /></AppShell>;
  if (error) return <AppShell><ErrorState message={error} onRetry={loadData} /></AppShell>;

  const statCards = [
    { label: "Total Analyses", value: stats?.total_analyses ?? 0, icon: FileText, color: "text-brand-light", bg: "bg-brand/10" },
    { label: "Average Score", value: `${Math.round(stats?.average_score ?? 0)}%`, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Highest Score", value: `${Math.round(stats?.highest_score ?? 0)}%`, icon: Award, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Last 7 Days", value: stats?.recent_activity_7_days ?? 0, icon: Activity, color: "text-sky-400", bg: "bg-sky-500/10" },
  ];

  const dist = stats?.score_distribution ?? {};
  const maxDist = Math.max(...Object.values(dist), 1);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-gray-100">
          Welcome back, {user?.full_name || user?.username}
        </h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your recruitment activity</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-bg-elevated">
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <p className="font-display text-2xl font-bold text-gray-100">{s.value}</p>
            <p className="mt-1 text-xs text-gray-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Score Distribution</h3>
          <div className="space-y-3">
            {Object.entries(dist).map(([range, count]) => (
              <div key={range}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-gray-400">{range}%</span>
                  <span className="font-mono text-gray-500">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-bg-border">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-700"
                    style={{ width: `${(count / maxDist) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {Object.keys(dist).length === 0 && (
              <p className="text-sm text-gray-500">No data yet</p>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Recent Analyses</h3>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No analyses yet. Upload a resume to get started.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((item) => (
                <div key={item.id} className="flex items-center gap-4 rounded-lg border border-bg-border bg-bg-elevated p-3">
                  <ScoreRing score={item.overall_score} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-200">{item.candidate_name || item.filename}</p>
                    <p className="truncate text-xs text-gray-500">{item.filename} · {formatDate(item.created_at)}</p>
                  </div>
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${scoreColor(item.overall_score)}`}>
                    {scoreLabel(item.overall_score)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
