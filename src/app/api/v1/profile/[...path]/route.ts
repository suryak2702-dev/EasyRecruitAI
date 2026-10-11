import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { authenticateToken, toFrontendUser } from "@/lib/auth-service";
import { extractToken } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase.from("app_users").select("*").eq("id", user.id).maybeSingle();
  if (error || !data) return NextResponse.json({ detail: "Profile not found" }, { status: 404 });

  const row = data as Record<string, unknown>;
  const photoUrl = row.photo_url as string | null;
  return NextResponse.json({
    id: Number(row.id),
    user_id: Number(row.id),
    email: String(row.email),
    username: String(row.username),
    full_name: row.full_name || null,
    role: String(row.role),
    date_of_birth: row.date_of_birth || null,
    gender: row.gender || null,
    phone: row.phone || null,
    address: row.address || null,
    photo_url: photoUrl,
    profile_complete: Boolean(row.profile_complete),
    has_photo: !!photoUrl,
    profile_updated_at: row.updated_at || null,
    created_at: String(row.created_at),
  });
}

export async function PUT(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["full_name", "date_of_birth", "gender", "phone", "address"]) {
    if (body[key] !== undefined) updates[key] = body[key] || null;
  }
  updates.profile_complete = Boolean(updates.full_name && updates.phone && updates.address);

  const { data, error } = await supabase.from("app_users").update(updates).eq("id", user.id).select("*").single();
  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });

  const row = data as Record<string, unknown>;
  const photoUrl = row.photo_url as string | null;
  return NextResponse.json({
    id: Number(row.id),
    user_id: Number(row.id),
    email: String(row.email),
    username: String(row.username),
    full_name: row.full_name || null,
    role: String(row.role),
    date_of_birth: row.date_of_birth || null,
    gender: row.gender || null,
    phone: row.phone || null,
    address: row.address || null,
    photo_url: photoUrl,
    profile_complete: Boolean(row.profile_complete),
    has_photo: !!photoUrl,
    profile_updated_at: row.updated_at || null,
    created_at: String(row.created_at),
  });
}

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  if (pathParts[pathParts.length - 1] !== "photo") {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ detail: "No file uploaded" }, { status: 422 });

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ detail: "Image must be under 2 MB." }, { status: 422 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const { data, error } = await supabase
      .from("app_users")
      .update({ photo_url: base64, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ detail: error.message }, { status: 500 });

    const row = data as Record<string, unknown>;
    return NextResponse.json({
      id: Number(row.id),
      user_id: Number(row.id),
      email: String(row.email),
      username: String(row.username),
      full_name: row.full_name || null,
      role: String(row.role),
      date_of_birth: row.date_of_birth || null,
      gender: row.gender || null,
      phone: row.phone || null,
      address: row.address || null,
      photo_url: row.photo_url,
      profile_complete: Boolean(row.profile_complete),
      has_photo: true,
      profile_updated_at: row.updated_at || null,
      created_at: String(row.created_at),
    });
  } catch (e) {
    return NextResponse.json({ detail: `Upload failed: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("app_users")
    .update({ photo_url: null, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ detail: error.message }, { status: 500 });

  const row = data as Record<string, unknown>;
  return NextResponse.json({
    id: Number(row.id),
    user_id: Number(row.id),
    email: String(row.email),
    username: String(row.username),
    full_name: row.full_name || null,
    role: String(row.role),
    date_of_birth: row.date_of_birth || null,
    gender: row.gender || null,
    phone: row.phone || null,
    address: row.address || null,
    photo_url: null,
    profile_complete: Boolean(row.profile_complete),
    has_photo: false,
    profile_updated_at: row.updated_at || null,
    created_at: String(row.created_at),
  });
}
