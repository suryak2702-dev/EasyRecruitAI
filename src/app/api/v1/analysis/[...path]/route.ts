import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { authenticateToken } from "@/lib/auth-service";
import { extractToken } from "@/lib/jwt";
import { extractTextFromFile, extractContactInfo } from "@/lib/parser";
import { calculateAtsScore } from "@/lib/scoring";

export const maxDuration = 60;

function toListItem(row: Record<string, unknown>, full = false): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: Number(row.id),
    user_id: row.user_id != null ? Number(row.user_id) : null,
    job_id: row.job_id != null ? Number(row.job_id) : null,
    filename: String(row.filename),
    candidate_name: row.candidate_name || null,
    candidate_email: row.candidate_email || null,
    candidate_phone: row.candidate_phone || null,
    overall_score: Number(row.overall_score) || 0,
    keyword_score: Number(row.keyword_score) || 0,
    skill_score: Number(row.skill_score) || 0,
    structure_score: Number(row.structure_score) || 0,
    semantic_score: row.semantic_score != null ? Number(row.semantic_score) : 0,
    experience_score: Number(row.experience_score) || 0,
    education_score: Number(row.education_score) || 0,
    detected_domain: row.detected_domain || null,
    status: String(row.status),
    created_at: String(row.created_at),
  };
  if (full) {
    base.extracted_text = row.extracted_text || null;
    base.matched_keywords = row.matched_keywords || null;
    base.matched_skills = row.matched_skills || null;
    base.missing_skills = row.missing_skills || null;
    base.recommendations = row.recommendations || null;
    base.analysis_data = row.analysis_data || null;
  }
  return base;
}

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  const last = pathParts[pathParts.length - 1];

  if (last === "summary" && pathParts.includes("stats")) {
    const { count: totalAnalyses } = await supabase.from("resume_analyses").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    const { data: analyses } = await supabase.from("resume_analyses").select("overall_score").eq("user_id", user.id);
    const scores = (analyses || []).map((a: { overall_score: number }) => Number(a.overall_score) || 0);
    const avgScore = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
    const highest = scores.length ? Math.max(...scores) : 0;
    const lowest = scores.length ? Math.min(...scores) : 0;
    const { count: totalJobs } = await supabase.from("jobs").select("*", { count: "exact", head: true }).eq("user_id", user.id);

    const dist: Record<string, number> = { "0-40": 0, "40-60": 0, "60-80": 0, "80-100": 0 };
    for (const s of scores) {
      if (s < 40) dist["0-40"]++;
      else if (s < 60) dist["40-60"]++;
      else if (s < 80) dist["60-80"]++;
      else dist["80-100"]++;
    }

    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 7);
    const { count: recentCount } = await supabase.from("resume_analyses").select("*", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", recentDate.toISOString());

    return NextResponse.json({
      total_analyses: totalAnalyses || 0,
      average_score: Math.round(avgScore * 10) / 10,
      highest_score: Math.round(highest * 10) / 10,
      lowest_score: Math.round(lowest * 10) / 10,
      score_distribution: dist,
      recent_activity_7_days: recentCount || 0,
      total_jobs: totalJobs || 0,
      total_datasets: 0,
      top_skills_found: [],
    });
  }

  if (last !== "analysis" && last !== "") {
    const id = parseInt(last, 10);
    if (id) {
      const { data, error } = await supabase.from("resume_analyses").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (error || !data) return NextResponse.json({ detail: "Analysis not found" }, { status: 404 });
      return NextResponse.json(toListItem(data as Record<string, unknown>, true));
    }
  }

  const params = req.nextUrl.searchParams;
  const page = parseInt(params.get("page") || "1", 10);
  const perPage = parseInt(params.get("per_page") || "10", 10);

  const { data, error, count } = await supabase
    .from("resume_analyses")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });

  const total = count || 0;
  const totalPages = Math.ceil(total / perPage);
  return NextResponse.json({
    items: (data || []).map((d) => toListItem(d as Record<string, unknown>)),
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

  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  if (pathParts[pathParts.length - 1] === "analyze") return analyze(req, user.id);
  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}

export async function DELETE(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  const id = parseInt(pathParts[pathParts.length - 1], 10);
  if (!id) return NextResponse.json({ detail: "Invalid ID" }, { status: 400 });

  const { error } = await supabase.from("resume_analyses").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ detail: "Delete failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}

async function analyze(req: NextRequest, userId: number) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const jobDescription = (formData.get("job_description") as string) || null;
    const jobIdRaw = formData.get("job_id");
    const jobId = jobIdRaw ? parseInt(jobIdRaw as string, 10) : null;

    if (!file) return NextResponse.json({ detail: "No file uploaded" }, { status: 422 });

    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (!["pdf", "docx"].includes(ext)) {
      return NextResponse.json({ detail: "Only PDF and DOCX files are supported." }, { status: 422 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ detail: "File size must be under 10 MB." }, { status: 422 });
    }

    let extractedText: string;
    try {
      extractedText = await extractTextFromFile(file);
    } catch (e) {
      return NextResponse.json({ detail: `File parsing failed: ${(e as Error).message}. The document may be corrupted or password-protected.` }, { status: 422 });
    }

    if (!extractedText || extractedText.trim().length < 10) {
      return NextResponse.json({ detail: "No readable text could be extracted from this file." }, { status: 422 });
    }

    const contact = extractContactInfo(extractedText);
    const score = calculateAtsScore(extractedText, jobDescription);

    const insertData: Record<string, unknown> = {
      user_id: userId,
      job_id: jobId,
      filename: file.name,
      candidate_name: contact.name,
      candidate_email: contact.email,
      candidate_phone: contact.phone,
      extracted_text: extractedText,
      overall_score: score.overall_score,
      keyword_score: score.keyword_match_score,
      skill_score: score.skill_match_score,
      structure_score: score.structure_score,
      semantic_score: score.semantic_similarity,
      experience_score: score.experience_score,
      education_score: score.education_score,
      matched_keywords: JSON.stringify(score.breakdown.keywords),
      matched_skills: JSON.stringify(score.breakdown.skill_analysis),
      missing_skills: JSON.stringify(score.breakdown.skill_analysis.missing_skills),
      recommendations: JSON.stringify(score.breakdown.recommendations),
      analysis_data: JSON.stringify(score),
      detected_domain: score.detected_domain,
      status: "completed",
    };

    const { data, error } = await supabase.from("resume_analyses").insert(insertData).select("id, created_at").single();
    if (error) return NextResponse.json({ detail: "Failed to save analysis" }, { status: 500 });

    await supabase.from("analysis_history").insert({
      user_id: userId,
      analysis_id: data.id,
      analysis_type: "resume_analysis",
      description: `Analyzed ${file.name}`,
      result_summary: `Score: ${score.overall_score}`,
    });

    return NextResponse.json({
      analysis_id: data.id,
      filename: file.name,
      extracted_text_length: extractedText.length,
      candidate_name: contact.name,
      candidate_email: contact.email,
      candidate_phone: contact.phone,
      overall_score: score.overall_score,
      keyword_match_score: score.keyword_match_score,
      skill_match_score: score.skill_match_score,
      structure_score: score.structure_score,
      semantic_similarity: score.semantic_similarity,
      experience_score: score.experience_score,
      education_score: score.education_score,
      accuracy_estimate: score.accuracy_estimate,
      nlp_analysis: {
        detected_domain: score.detected_domain,
        domain_confidence: score.domain_confidence,
        is_likely_resume: score.is_likely_resume,
      },
      breakdown: score.breakdown,
      status: "completed",
      created_at: data.created_at,
    });
  } catch (e) {
    return NextResponse.json({ detail: `Analysis failed: ${(e as Error).message}` }, { status: 500 });
  }
}
