import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import {
  registerUser,
  loginUser,
  authenticateToken,
  toFrontendUser,
  hashPassword,
  verifyPassword,
  getUserById,
  blacklistToken,
} from "@/lib/auth-service";
import { extractToken } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  const subPath = pathParts[pathParts.length - 1];

  if (subPath === "companies") {
    const { data, error } = await supabase.from("companies").select("name, recruiter_domain").order("name");
    if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (subPath === "me") {
    const token = extractToken(req);
    const user = token ? await authenticateToken(token) : null;
    if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
    return NextResponse.json(toFrontendUser(user));
  }

  if (subPath === "admin" && pathParts.includes("stats")) {
    const token = extractToken(req);
    const user = token ? await authenticateToken(token) : null;
    if (!user || user.role !== "admin") return NextResponse.json({ detail: "Admin access required" }, { status: 403 });

    const { count: totalUsers } = await supabase.from("app_users").select("*", { count: "exact", head: true });
    const { count: activeUsers } = await supabase.from("app_users").select("*", { count: "exact", head: true }).eq("is_active", true);
    const { count: totalAnalyses } = await supabase.from("resume_analyses").select("*", { count: "exact", head: true });
    const { count: totalJobs } = await supabase.from("jobs").select("*", { count: "exact", head: true });
    const { data: users } = await supabase.from("app_users").select("role");

    const usersByRole: Record<string, number> = {};
    for (const u of users || []) {
      usersByRole[u.role] = (usersByRole[u.role] || 0) + 1;
    }

    const { data: analyses } = await supabase.from("resume_analyses").select("overall_score");
    const scores = (analyses || []).map((a: { overall_score: number }) => Number(a.overall_score) || 0);
    const avgScore = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;

    return NextResponse.json({
      total_users: totalUsers || 0,
      active_users: activeUsers || 0,
      total_analyses: totalAnalyses || 0,
      avg_score: Math.round(avgScore * 10) / 10,
      total_jobs: totalJobs || 0,
      users_by_role: usersByRole,
    });
  }

  if (subPath === "users" && pathParts.includes("admin")) {
    const token = extractToken(req);
    const user = token ? await authenticateToken(token) : null;
    if (!user || user.role !== "admin") return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
    const { data, error } = await supabase.from("app_users").select("*").order("created_at", { ascending: false });
    if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
    return NextResponse.json((data || []).map((u) => toFrontendUser(u as unknown as Parameters<typeof toFrontendUser>[0])));
  }

  if (subPath === "team" && pathParts.includes("company-admin")) {
    const token = extractToken(req);
    const user = token ? await authenticateToken(token) : null;
    if (!user || (user.role !== "company_admin" && user.role !== "admin")) {
      return NextResponse.json({ detail: "Company admin access required" }, { status: 403 });
    }
    const companyName = user.company_name;
    if (!companyName) return NextResponse.json({ detail: "No company associated" }, { status: 400 });
    const { data, error } = await supabase.from("app_users").select("*").eq("company_name", companyName).order("created_at");
    if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
    return NextResponse.json({
      company: companyName,
      total: (data || []).length,
      recruiters: (data || []).map((u) => toFrontendUser(u as unknown as Parameters<typeof toFrontendUser>[0])),
    });
  }

  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  const subPath = pathParts[pathParts.length - 1];

  if (subPath === "register") {
    const body = await req.json();
    const { user, error } = await registerUser(body);
    if (error) return NextResponse.json({ detail: error }, { status: 400 });
    return NextResponse.json(toFrontendUser(user));
  }

  if (subPath === "login") {
    const body = await req.json();
    const { token, user, error } = await loginUser(body.email, body.password);
    if (error) return NextResponse.json({ detail: error }, { status: 401 });
    return NextResponse.json({
      access_token: token,
      token_type: "bearer",
      expires_in: 604800,
      user: toFrontendUser(user!),
    });
  }

  if (subPath === "logout") {
    const token = extractToken(req);
    if (token) await blacklistToken(token);
    return NextResponse.json({ success: true });
  }

  if (subPath === "change-password") {
    const token = extractToken(req);
    const user = token ? await authenticateToken(token) : null;
    if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
    const body = await req.json();
    const row = await getUserById(user.id);
    if (!row) return NextResponse.json({ detail: "User not found" }, { status: 404 });
    const valid = await verifyPassword(body.current_password, row.password_hash as string);
    if (!valid) return NextResponse.json({ detail: "Current password is incorrect" }, { status: 400 });
    const newHash = await hashPassword(body.new_password);
    await supabase.from("app_users").update({ password_hash: newHash, updated_at: new Date().toISOString() }).eq("id", user.id);
    return NextResponse.json({ success: true, message: "Password changed successfully" });
  }

  if (subPath === "approve" && pathParts.includes("company-admin")) {
    const token = extractToken(req);
    const user = token ? await authenticateToken(token) : null;
    if (!user || (user.role !== "company_admin" && user.role !== "admin")) {
      return NextResponse.json({ detail: "Company admin access required" }, { status: 403 });
    }
    const id = parseInt(pathParts[pathParts.length - 2], 10);
    await supabase.from("app_users").update({ approval_status: "approved" }).eq("id", id);
    return NextResponse.json({ success: true });
  }

  if (subPath === "reject" && pathParts.includes("company-admin")) {
    const token = extractToken(req);
    const user = token ? await authenticateToken(token) : null;
    if (!user || (user.role !== "company_admin" && user.role !== "admin")) {
      return NextResponse.json({ detail: "Company admin access required" }, { status: 403 });
    }
    const id = parseInt(pathParts[pathParts.length - 2], 10);
    await supabase.from("app_users").update({ approval_status: "rejected" }).eq("id", id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}

export async function PUT(req: NextRequest) {
  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  const subPath = pathParts[pathParts.length - 1];

  if (subPath === "me") {
    const token = extractToken(req);
    const user = token ? await authenticateToken(token) : null;
    if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ["full_name", "username", "company_name"]) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    const { data, error } = await supabase.from("app_users").update(updates).eq("id", user.id).select("*").single();
    if (error) return NextResponse.json({ detail: error.message }, { status: 500 });
    return NextResponse.json(toFrontendUser(data as unknown as Parameters<typeof toFrontendUser>[0]));
  }

  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}

export async function PATCH(req: NextRequest) {
  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);

  if (pathParts.includes("toggle")) {
    const token = extractToken(req);
    const user = token ? await authenticateToken(token) : null;
    if (!user || user.role !== "admin") return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
    const id = parseInt(pathParts[pathParts.length - 2], 10);
    const target = await getUserById(id);
    if (!target) return NextResponse.json({ detail: "User not found" }, { status: 404 });
    const newState = !target.is_active;
    await supabase.from("app_users").update({ is_active: newState }).eq("id", id);
    return NextResponse.json({ success: true, is_active: newState });
  }

  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}

export async function DELETE(req: NextRequest) {
  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);

  if (pathParts.includes("admin") && pathParts.includes("users")) {
    const token = extractToken(req);
    const user = token ? await authenticateToken(token) : null;
    if (!user || user.role !== "admin") return NextResponse.json({ detail: "Admin access required" }, { status: 403 });
    const id = parseInt(pathParts[pathParts.length - 1], 10);
    if (id === user.id) return NextResponse.json({ detail: "Cannot delete your own account" }, { status: 400 });
    await supabase.from("app_users").delete().eq("id", id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}
