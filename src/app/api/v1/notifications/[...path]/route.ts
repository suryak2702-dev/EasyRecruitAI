import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { authenticateToken } from "@/lib/auth-service";
import { extractToken } from "@/lib/jwt";
import { extractTextFromFile } from "@/lib/parser";

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  const last = pathParts[pathParts.length - 1];

  if (last === "stats") {
    const { data: notifications } = await supabase.from("notifications").select("*");
    const { count: totalApplications } = await supabase.from("job_applications").select("*", { count: "exact", head: true });

    const companies = new Set((notifications || []).map((n: Record<string, unknown>) => n.company));
    const totalOpenings = (notifications || []).reduce((sum: number, n: Record<string, unknown>) => sum + (Number(n.openings) || 0), 0);

    return NextResponse.json({
      total_companies: companies.size,
      total_positions: notifications?.length || 0,
      total_openings: totalOpenings,
      total_applications: totalApplications || 0,
    });
  }

  if (last === "my-applications") {
    const { data, error } = await supabase
      .from("job_applications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
    return NextResponse.json({ total: data?.length || 0, applications: data || [] });
  }

  const { data: notifications } = await supabase.from("notifications").select("*").order("posted_date", { ascending: false });
  const { data: apps } = await supabase.from("job_applications").select("notification_id").eq("user_id", user.id);
  const appliedIds = (apps || []).map((a: Record<string, unknown>) => Number(a.notification_id));

  const items = (notifications || []).map((n: Record<string, unknown>) => ({
    id: Number(n.id),
    position_title: String(n.position_title),
    company: String(n.company),
    location: n.location || null,
    job_type: n.job_type || null,
    openings: Number(n.openings) || 0,
    eligibility: n.eligibility || null,
    posted_date: String(n.posted_date),
    already_applied: appliedIds.includes(Number(n.id)) ? [Number(n.id)] : [],
  }));

  return NextResponse.json({ total: items.length, notifications: items });
}

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  if (pathParts[pathParts.length - 1] !== "apply") {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const notificationId = parseInt(formData.get("notification_id") as string, 10);
    const positionTitle = formData.get("position_title") as string;
    const company = formData.get("company") as string;
    const coverNote = (formData.get("cover_note") as string) || "";
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ detail: "Resume file is required" }, { status: 422 });

    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (!["pdf", "docx"].includes(ext)) {
      return NextResponse.json({ detail: "Only PDF and DOCX files are supported." }, { status: 422 });
    }

    let extractedText = "";
    try {
      extractedText = await extractTextFromFile(file);
    } catch {
      // continue even if extraction fails
    }

    const { data, error } = await supabase
      .from("job_applications")
      .insert({
        user_id: user.id,
        notification_id: notificationId,
        company,
        position_title: positionTitle,
        resume_filename: file.name,
        resume_text: extractedText.substring(0, 10000),
        cover_note: coverNote,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ detail: "Failed to submit application" }, { status: 500 });
    return NextResponse.json({ success: true, application_id: data.id });
  } catch (e) {
    return NextResponse.json({ detail: `Application failed: ${(e as Error).message}` }, { status: 500 });
  }
}
