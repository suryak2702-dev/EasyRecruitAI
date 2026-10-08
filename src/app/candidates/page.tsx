"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, ScoreRing, Badge, ErrorState, EmptyState, LoadingOverlay } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { AnalysisListItem, PaginatedResponse } from "@/types";
import { formatDate, scoreColor, scoreLabel } from "@/lib/utils";
import { Users } from "lucide-react";

export default function CandidatesPage() {
  const [items, setItems] = useState<AnalysisListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AnalysisListItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res: PaginatedResponse<AnalysisListItem> = await api.analysisList(1, 50);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load candidates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <AppShell><LoadingOverlay message="Loading candidates..." /></AppShell>;
  if (error) return <AppShell><ErrorState message={error} onRetry={load} /></AppShell>;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-100">Candidates</h1>
        <p className="mt-1 text-sm text-gray-500">{items.length} analyzed resume{items.length !== 1 ? "s" : ""}</p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No candidates yet"
          description="Analyze resumes to build your candidate pool."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="cursor-pointer hover:border-brand/40 transition-colors" >
              <div className="flex items-center gap-4">
                <ScoreRing score={item.overall_score} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-100">{item.candidate_name || "Unknown"}</p>
                  <p className="truncate text-xs text-gray-500">{item.candidate_email || item.filename}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${scoreColor(item.overall_score)}`}>
                      {scoreLabel(item.overall_score)}
                    </span>
                    {item.detected_domain && (
                      <Badge className="bg-bg-elevated text-gray-400 border border-bg-border">{item.detected_domain}</Badge>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-600">{formatDate(item.created_at)}</p>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
