"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, Button, Textarea, ScoreRing, Badge, ErrorState, LoadingOverlay, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { BiasCompareResult } from "@/types";
import { Scale, CloudUpload as UploadCloud } from "lucide-react";

export default function BiasPage() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDesc, setJobDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BiasCompareResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setResult(null); setError(""); }
  };

  const handleCompare = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.compareBias(file, jobDesc || undefined);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bias analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-100">Bias-Free Hiring</h1>
        <p className="mt-1 text-sm text-gray-500">Compare original vs anonymized resume scoring to detect bias</p>
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
          <Textarea
            label="Job Description (optional)"
            value={jobDesc}
            onChange={(e) => setJobDesc(e.target.value)}
            rows={3}
            placeholder="Paste JD for context..."
          />
          <Button onClick={handleCompare} loading={loading} disabled={!file} className="mt-4 w-full" size="lg">
            <Scale className="h-4 w-4" /> Compare Scores
          </Button>
          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Bias Comparison</h3>
          {loading ? (
            <LoadingOverlay message="Analyzing bias..." />
          ) : result ? (
            <div>
              <div className="mb-6 flex items-center justify-around">
                <div className="text-center">
                  <ScoreRing score={result.original_score} size={90} />
                  <p className="mt-2 text-xs text-gray-500">Original Score</p>
                </div>
                <div className="text-center">
                  <ScoreRing score={result.blind_score} size={90} />
                  <p className="mt-2 text-xs text-gray-500">Blind Score</p>
                </div>
              </div>

              <div className="mb-4 flex items-center justify-center gap-2">
                <Badge className={result.bias_detected ? "bg-rose-500/15 text-rose-300 border border-rose-500/30" : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"}>
                  {result.bias_detected ? "Bias Detected" : "No Significant Bias"}
                </Badge>
                <span className="text-sm text-gray-500">
                  Difference: {result.score_difference > 0 ? "+" : ""}{result.score_difference} pts
                </span>
              </div>

              <div className="rounded-lg border border-bg-border bg-bg-elevated p-4">
                <p className="text-sm text-gray-300">{result.bias_interpretation}</p>
                <p className="mt-2 text-sm font-medium text-brand-light">{result.recommendation}</p>
              </div>

              {result.pii_removed && (
                <p className="mt-3 text-xs text-gray-500">
                  {typeof result.pii_removed === "number" ? `${result.pii_removed} PII items removed` : "PII removed from analysis"}
                </p>
              )}
            </div>
          ) : (
            <EmptyState title="No comparison yet" description="Upload a resume to compare biased vs blind scoring." />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
