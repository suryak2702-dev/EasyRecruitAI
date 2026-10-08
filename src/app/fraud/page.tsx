"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, Button, Badge, ErrorState, LoadingOverlay, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { FraudResult } from "@/types";
import { riskColor, riskLabel } from "@/lib/utils";
import { ShieldAlert, CloudUpload as UploadCloud, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle } from "lucide-react";

export default function FraudPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FraudResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setResult(null); setError(""); }
  };

  const handleDetect = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.detectFraud(file);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Fraud detection failed.");
    } finally {
      setLoading(false);
    }
  };

  const severityColor = (s: string) => {
    if (s === "high") return "text-rose-400 border-rose-500/30 bg-rose-500/10";
    if (s === "medium") return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    return "text-sky-400 border-sky-500/30 bg-sky-500/10";
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-100">Fraud Detection</h1>
        <p className="mt-1 text-sm text-gray-500">Detect suspicious patterns in resumes</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Upload Resume</h3>
          <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-bg-border bg-bg-elevated px-6 py-12 text-center transition-colors hover:border-brand">
            <UploadCloud className="mb-3 h-10 w-10 text-gray-500" />
            <p className="text-sm font-medium text-gray-300">{file ? file.name : "Click to select"}</p>
            <p className="mt-1 text-xs text-gray-500">PDF or DOCX</p>
            <input type="file" accept=".pdf,.docx,.doc" onChange={handleFileChange} className="hidden" />
          </label>
          <Button onClick={handleDetect} loading={loading} disabled={!file} className="w-full" size="lg">
            <ShieldAlert className="h-4 w-4" /> Run Fraud Check
          </Button>
          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Fraud Report</h3>
          {loading ? (
            <LoadingOverlay message="Checking for fraud indicators..." />
          ) : result ? (
            <div>
              <div className="mb-6 flex items-center gap-4">
                <div className={`flex h-16 w-16 items-center justify-center rounded-full ${result.risk_level === "clean" || result.risk_level === "low_risk" ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
                  {result.risk_level === "clean" ? (
                    <CheckCircle className="h-8 w-8 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-8 w-8 text-rose-400" />
                  )}
                </div>
                <div>
                  <p className={`font-display text-xl font-bold ${riskColor(result.risk_level)}`}>
                    {riskLabel(result.risk_level)}
                  </p>
                  <p className="text-sm text-gray-500">Fraud Score: {result.fraud_score}/100</p>
                  <p className="text-xs text-gray-600">
                    {result.high_severity} high · {result.medium_severity} medium · {result.low_severity} low
                  </p>
                </div>
              </div>

              {result.flags.length > 0 ? (
                <div className="space-y-2">
                  {result.flags.map((f, i) => (
                    <div key={i} className={`rounded-lg border px-3 py-2 ${severityColor(f.severity)}`}>
                      <p className="text-sm font-medium">{f.message}</p>
                      <p className="mt-1 text-xs opacity-70">{f.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-emerald-400">No red flags detected.</p>
              )}

              {result.recommendations.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-gray-500">RECOMMENDATIONS</p>
                  <ul className="space-y-1.5">
                    {result.recommendations.map((r, i) => (
                      <li key={i} className="text-sm text-gray-400">· {r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="No report yet" description="Upload a resume and run a fraud check." />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
