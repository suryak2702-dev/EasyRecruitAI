import bcrypt from "bcryptjs";
import { supabase } from "./db";
import { createToken, verifyToken, type JwtPayload } from "./jwt";

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  full_name: string | null;
  company_name: string | null;
  role: string;
  is_active: boolean;
  approval_status: string;
  login_count: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  photo_url: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  profile_complete: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getUserByEmail(email: string) {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getUserById(id: number) {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCompanyByName(name: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const { data } = await supabase
    .from("token_blacklist")
    .select("jti")
    .eq("jti", jti)
    .maybeSingle();
  return !!data;
}

export async function blacklistToken(token: string): Promise<void> {
  const payload = verifyToken(token);
  if (!payload || !payload.jti) return;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await supabase.from("token_blacklist").insert({
    jti: payload.jti,
    user_id: payload.userId,
    expires_at: expiresAt.toISOString(),
  });
}

export async function authenticateToken(token: string): Promise<AuthUser | null> {
  const payload = verifyToken(token);
  if (!payload) return null;
  if (payload.jti && await isTokenBlacklisted(payload.jti)) return null;
  const row = await getUserById(payload.userId);
  if (!row || !row.is_active) return null;
  return toAuthUser(row);
}

export function toAuthUser(row: Record<string, unknown>): AuthUser {
  return {
    id: Number(row.id),
    email: String(row.email),
    username: String(row.username),
    full_name: (row.full_name as string) || null,
    company_name: (row.company_name as string) || null,
    role: String(row.role),
    is_active: Boolean(row.is_active),
    approval_status: String(row.approval_status),
    login_count: Number(row.login_count) || 0,
    last_login_at: (row.last_login_at as string) || null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    photo_url: (row.photo_url as string) || null,
    date_of_birth: (row.date_of_birth as string) || null,
    gender: (row.gender as string) || null,
    phone: (row.phone as string) || null,
    address: (row.address as string) || null,
    profile_complete: Boolean(row.profile_complete),
  };
}

export function toFrontendUser(u: AuthUser) {
  return u;
}

export async function registerUser(body: {
  email: string;
  password: string;
  full_name?: string;
  username?: string;
  role: string;
  company_name?: string;
}): Promise<{ user: AuthUser; error?: string }> {
  const email = body.email.toLowerCase().trim();
  const existing = await getUserByEmail(email);
  if (existing) return { user: null as unknown as AuthUser, error: "An account with this email already exists." };

  const username = body.username?.trim() || email.split("@")[0];
  const { data: existingU } = await supabase.from("app_users").select("id").eq("username", username).maybeSingle();
  if (existingU) return { user: null as unknown as AuthUser, error: "Username already taken." };

  let companyName: string | null = null;
  let approvalStatus = "approved";

  if (body.role === "recruiter") {
    if (!body.company_name) return { user: null as unknown as AuthUser, error: "Company name is required for recruiters." };
    const company = await getCompanyByName(body.company_name);
    if (!company) return { user: null as unknown as AuthUser, error: "Company not found in our records." };
    const domain = company.recruiter_domain as string;
    if (domain && !email.endsWith(`@${domain}`) && !email.endsWith(`.${domain}`)) {
      return { user: null as unknown as AuthUser, error: `Recruiter email must end with @${domain}` };
    }
    companyName = body.company_name;
    approvalStatus = "pending";
  }

  const passwordHash = await hashPassword(body.password);
  const insertData: Record<string, unknown> = {
    email,
    username,
    password_hash: passwordHash,
    full_name: body.full_name || null,
    role: body.role,
    company_name: companyName,
    approval_status: approvalStatus,
    is_active: true,
    login_count: 0,
    profile_complete: false,
  };

  const { data, error } = await supabase.from("app_users").insert(insertData).select("*").single();
  if (error) return { user: null as unknown as AuthUser, error: "Failed to create account." };

  return { user: toAuthUser(data as Record<string, unknown>) };
}

export async function loginUser(email: string, password: string): Promise<{ token?: string; user?: AuthUser; error?: string }> {
  const row = await getUserByEmail(email.toLowerCase().trim());
  if (!row) return { error: "Invalid email or password." };
  if (!row.is_active) return { error: "Your account has been disabled. Contact an administrator." };
  if (row.approval_status === "rejected") return { error: "Your account application has been rejected." };

  const valid = await verifyPassword(password, row.password_hash as string);
  if (!valid) return { error: "Invalid email or password." };

  await supabase
    .from("app_users")
    .update({ last_login_at: new Date().toISOString(), login_count: (Number(row.login_count) || 0) + 1 })
    .eq("id", row.id);

  const payload: JwtPayload = {
    userId: Number(row.id),
    email: String(row.email),
    role: String(row.role),
  };
  const token = createToken(payload);
  const user = toAuthUser(row as Record<string, unknown>);
  return { token, user };
}
