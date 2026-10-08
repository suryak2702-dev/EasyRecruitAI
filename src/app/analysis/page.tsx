"use client";

import { useState, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, Button, Textarea, ScoreRing, ScoreBar, Badge, ErrorState, LoadingOverlay } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ResumeAnalysisFullResponse, Job } from "@/types";
import { CloudUpload as UploadCloud, FileText } from "lucide-react";

export default function AnalysisPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [jobDesc, setJobDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResumeAnalysisFullResponse | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      setError("");
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.analyzeResume(file, jobDesc || undefined);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canAnalyze = user?.role && user.role !== "candidate";

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-100">Resume Analysis</h1>
        <p className="mt-1 text-sm text-gray-500">Upload a resume (PDF/DOCX) to get an AI-powered ATS score</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Upload Resume</h3>

          <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-bg-border bg-bg-elevated px-6 py-12 text-center transition-colors hover:border-brand">
            <UploadCloud className="mb-3 h-10 w-10 text-gray-500" />
            <p className="text-sm font-medium text-gray-300">
              {file ? file.name : "Click to select a file"}
            </p>
            <p className="mt-1 text-xs text-gray-500">PDF or DOCX, max 10 MB</p>
            <input type="file" accept=".pdf,.docx,.doc" onChange={handleFileChange} className="hidden" />
          </label>

          <Textarea
            label="Job Description (optional)"
            value={jobDesc}
            onChange={(e) => setJobDesc(e.target.value)}
            rows={4}
            placeholder="Paste the job description to get a match score..."
          />

          <Button onClick={handleAnalyze} loading={loading} disabled={!file} className="mt-4 w-full" size="lg">
            <FileText className="h-4 w-4" /> Analyze Resume
          </Button>

          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Results</h3>
          {loading ? (
            <LoadingOverlay message="Analyzing resume..." />
          ) : result ? (
            <div>
              <div className="mb-6 flex items-center gap-4">
                <ScoreRing score={result.overall_score} size={100} />
                <div>
                  <p className="font-display text-lg font-semibold text-gray-100">
                    {result.candidate_name || "Unknown Candidate"}
                  </p>
                  <p className="text-sm text-gray-500">{result.candidate_email || ""}</p>
                  <p className="mt-1 text-xs text-gray-600">{result.filename}</p>
                  <p className="mt-1 text-xs text-gray-600">
                    Domain: {result.detected_domain || "general"} · Accuracy: {Math.round(result.accuracy_estimate)}%
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <ScoreBar label="Keyword Match" value={result.keyword_match_score} />
                <ScoreBar label="Skill Match" value={result.skill_match_score} />
                <ScoreBar label="Structure" value={result.structure_score} />
                {result.semantic_similarity != null && (
                  <ScoreBar label="Semantic Similarity" value={result.semantic_similarity} />
                )}
                <ScoreBar label="Experience" value={result.experience_score} />
                <ScoreBar label="Education" value={result.education_score} />
              </div>

              {result.breakdown && typeof result.breakdown === "object" && (() => {
                const breakdown = result.breakdown as Record<string, unknown>;
                const skillAnalysis = breakdown.skill_analysis as Record<string, unknown> | undefined;
                const matched = skillAnalysis?.matched_skills as string[] | undefined;
                const missing = skillAnalysis?.missing_skills as string[] | undefined;
                const recs = breakdown.recommendations as Array<{ category: string; suggestion: string; priority: string }> | undefined;

                return (
                  <div className="mt-6 space-y-4">
                    {matched && matched.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold text-gray-400">MATCHED SKILLS</p>
                        <div className="flex flex-wrap gap-1.5">
                          {matched.map((s, i) => (
                            <Badge key={i} className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {missing && missing.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold text-gray-400">MISSING SKILLS</p>
                        <div className="flex flex-wrap gap-1.5">
                          {missing.slice(0, 12).map((s, i) => (
                            <Badge key={i} className="bg-rose-500/15 text-rose-300 border border-rose-500/30">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {recs && recs.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold text-gray-400">RECOMMENDATIONS</p>
                        <ul className="space-y-2">
                          {recs.slice(0, 5).map((r, i) => (
                            <li key={i} className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-gray-300">
                              <span className={`mr-2 text-xs font-semibold ${r.priority === "high" ? "text-rose-400" : r.priority === "medium" ? "text-amber-400" : "text-sky-400"}`}>
                                {r.priority.toUpperCase()}
                              </span>
                              {r.suggestion}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="mb-3 h-10 w-10 text-gray-600" />
              <p className="text-sm text-gray-500">Upload a resume and click Analyze to see results</p>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
