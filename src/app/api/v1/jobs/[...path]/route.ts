import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { authenticateToken, toFrontendUser } from "@/lib/auth-service";
import { extractToken } from "@/lib/jwt";
import type { Job } from "@/types";

function toFrontendJob(row: Record<string, unknown>): Job {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    title: String(row.title),
    company: (row.company as string) || null,
    department: (row.department as string) || null,
    location: (row.location as string) || null,
    job_type: String(row.job_type) as Job["job_type"],
    description: String(row.description),
    required_skills: parseJsonArray(row.required_skills as string),
    preferred_skills: parseJsonArray(row.preferred_skills as string),
    min_experience: row.min_experience != null ? Number(row.min_experience) : null,
    max_experience: row.max_experience != null ? Number(row.max_experience) : null,
    education_level: (row.education_level as string) || null,
    salary_min: row.salary_min != null ? Number(row.salary_min) : null,
    salary_max: row.salary_max != null ? Number(row.salary_max) : null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function parseJsonArray(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  const last = pathParts[pathParts.length - 1];

  if (last !== "jobs" && last !== "") {
    const id = parseInt(last, 10);
    if (id) {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
      if (error || !data) return NextResponse.json({ detail: "Job not found" }, { status: 404 });
      return NextResponse.json(toFrontendJob(data as Record<string, unknown>));
    }
  }

  const params = req.nextUrl.searchParams;
  const page = parseInt(params.get("page") || "1", 10);
  const perPage = parseInt(params.get("per_page") || "10", 10);
  const search = params.get("search") || undefined;
  const jobType = params.get("job_type") || undefined;

  let query = supabase.from("jobs").select("*", { count: "exact" }).eq("user_id", user.id);
  if (search) query = query.or(`title.ilike.%${search}%,company.ilike.%${search}%`);
  if (jobType) query = query.eq("job_type", jobType);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });

  const total = count || 0;
  const totalPages = Math.ceil(total / perPage);
  return NextResponse.json({
    items: (data || []).map((d) => toFrontendJob(d as Record<string, unknown>)),
    total,
    page,
    page_size: perPage,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1,
  });
}

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  if (user.role === "candidate") return NextResponse.json({ detail: "Candidates cannot create jobs" }, { status: 403 });

  const body = await req.json();
  const insertData: Record<string, unknown> = {
    user_id: user.id,
    title: body.title,
    company: body.company || null,
    department: body.department || null,
    location: body.location || null,
    job_type: body.job_type || "full_time",
    description: body.description,
    required_skills: body.required_skills ? JSON.stringify(body.required_skills) : null,
    preferred_skills: body.preferred_skills ? JSON.stringify(body.preferred_skills) : null,
    min_experience: body.min_experience ?? null,
    max_experience: body.max_experience ?? null,
    education_level: body.education_level || null,
    salary_min: body.salary_min ?? null,
    salary_max: body.salary_max ?? null,
    is_active: true,
  };

  const { data, error } = await supabase.from("jobs").insert(insertData).select("*").single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
  return NextResponse.json(toFrontendJob(data as Record<string, unknown>));
}

export async function DELETE(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  const id = parseInt(pathParts[pathParts.length - 1], 10);
  if (!id) return NextResponse.json({ detail: "Invalid ID" }, { status: 400 });

  const { error } = await supabase.from("jobs").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ detail: "Delete failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}
