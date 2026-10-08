"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, Button, Input, Textarea, Select, Modal, Badge, ErrorState, EmptyState, LoadingOverlay } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Job, PaginatedResponse } from "@/types";
import { formatDate } from "@/lib/utils";
import { Plus, Trash2, Search, Briefcase } from "lucide-react";

export default function JobsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    title: "", company: "", department: "", location: "",
    job_type: "full_time", description: "", required_skills: "",
    min_experience: "", max_experience: "", education_level: "",
  });

  const loadJobs = useCallback(async (p: number) => {
    setLoading(true);
    setError("");
    try {
      const res: PaginatedResponse<Job> = await api.jobs(p, 10, search || undefined);
      setJobs(res.items);
      setTotal(res.total);
      setPage(res.page);
      setTotalPages(res.total_pages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadJobs(1);
  }, [loadJobs]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const skills = form.required_skills.split(",").map((s) => s.trim()).filter(Boolean);
      await api.createJob({
        title: form.title,
        company: form.company || undefined,
        department: form.department || undefined,
        location: form.location || undefined,
        job_type: form.job_type,
        description: form.description,
        required_skills: skills.length > 0 ? skills : undefined,
        min_experience: form.min_experience ? Number(form.min_experience) : undefined,
        max_experience: form.max_experience ? Number(form.max_experience) : undefined,
        education_level: form.education_level || undefined,
      });
      setShowForm(false);
      setForm({ title: "", company: "", department: "", location: "", job_type: "full_time", description: "", required_skills: "", min_experience: "", max_experience: "", education_level: "" });
      loadJobs(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create job.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this job posting?")) return;
    try {
      await api.deleteJob(id);
      loadJobs(page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete job.");
    }
  };

  if (loading && jobs.length === 0) return <AppShell><LoadingOverlay message="Loading jobs..." /></AppShell>;
  if (error && jobs.length === 0) return <AppShell><ErrorState message={error} onRetry={() => loadJobs(page)} /></AppShell>;

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-100">Job Descriptions</h1>
          <p className="mt-1 text-sm text-gray-500">{total} job{total !== 1 ? "s" : ""} posted</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New Job
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="mb-4">
        <Input
          placeholder="Search by title or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadJobs(1)}
        />
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Create your first job posting to start analyzing resumes against it."
          action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New Job</Button>}
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-brand-light" />
                    <h3 className="font-display text-base font-semibold text-gray-100">{job.title}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    {job.company && <span>{job.company}</span>}
                    {job.location && <span>· {job.location}</span>}
                    <span>· {job.job_type.replace(/_/g, " ")}</span>
                    {job.min_experience != null && <span>· {job.min_experience}-{job.max_experience} yrs</span>}
                    <span>· {formatDate(job.created_at)}</span>
                  </div>
                  {job.required_skills && job.required_skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {job.required_skills.slice(0, 8).map((s) => (
                        <Badge key={s} className="bg-brand/10 text-brand-light border border-brand/20">{s}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(job.id)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => loadJobs(page - 1)}>Prev</Button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => loadJobs(page + 1)}>Next</Button>
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Create Job Description">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Senior Python Engineer" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Corp" />
            <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Remote" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Job Type" value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })}>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
            </Select>
            <Input label="Education Level" value={form.education_level} onChange={(e) => setForm({ ...form, education_level: e.target.value })} placeholder="B.Tech" />
          </div>
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required rows={4} placeholder="We are looking for..." />
          <Input label="Required Skills (comma-separated)" value={form.required_skills} onChange={(e) => setForm({ ...form, required_skills: e.target.value })} placeholder="Python, Django, PostgreSQL" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Min Experience (years)" type="number" value={form.min_experience} onChange={(e) => setForm({ ...form, min_experience: e.target.value })} placeholder="0" />
            <Input label="Max Experience (years)" type="number" value={form.max_experience} onChange={(e) => setForm({ ...form, max_experience: e.target.value })} placeholder="5" />
          </div>
          <div className="flex gap-3">
            <Button type="submit" loading={creating}>Create</Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
