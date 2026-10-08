"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, Button, Textarea, Badge, ErrorState, LoadingOverlay, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { InterviewResult } from "@/types";
import { MessageSquare, CloudUpload as UploadCloud } from "lucide-react";

export default function InterviewsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDesc, setJobDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InterviewResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setResult(null); setError(""); }
  };

  const handleGenerate = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.generateInterview(file, jobDesc || undefined);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate questions.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-100">Interview Generator</h1>
        <p className="mt-1 text-sm text-gray-500">Generate tailored interview questions from a resume</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Upload Resume</h3>
          <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-bg-border bg-bg-elevated px-6 py-10 text-center transition-colors hover:border-brand">
            <UploadCloud className="mb-3 h-8 w-8 text-gray-500" />
            <p className="text-sm font-medium text-gray-300">{file ? file.name : "Click to select"}</p>
            <p className="mt-1 text-xs text-gray-500">PDF or DOCX</p>
            <input type="file" accept=".pdf,.docx,.doc" onChange={handleFileChange} className="hidden" />
          </label>
          <Textarea
            label="Job Description (optional)"
            value={jobDesc}
            onChange={(e) => setJobDesc(e.target.value)}
            rows={3}
            placeholder="Paste JD for better questions..."
          />
          <Button onClick={handleGenerate} loading={loading} disabled={!file} className="mt-4 w-full">
            <MessageSquare className="h-4 w-4" /> Generate Questions
          </Button>
          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Generated Questions</h3>
          {loading ? (
            <LoadingOverlay message="Generating questions..." />
          ) : result ? (
            <div>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge className="bg-brand/10 text-brand-light border border-brand/20">{result.experience_level}</Badge>
                <Badge className="bg-bg-elevated text-gray-400 border border-bg-border">{result.detected_domain}</Badge>
                <Badge className="bg-bg-elevated text-gray-400 border border-bg-border">{result.total_questions} questions</Badge>
              </div>
              {result.detected_skills.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {result.detected_skills.slice(0, 10).map((s, i) => (
                    <Badge key={i} className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{s}</Badge>
                  ))}
                </div>
              )}
              <div className="space-y-4">
                {result.category_list.map((cat) => {
                  const questions = result.categories[cat] || [];
                  return (
                    <div key={cat}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{cat}</p>
                      <ul className="space-y-2">
                        {questions.map((q, i) => (
                          <li key={i} className="rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-gray-300">
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState title="No questions yet" description="Upload a resume and click Generate." />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
