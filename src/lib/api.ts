import { getToken, setToken, clearToken } from "./utils";
import type {
  User, TokenResponse, Company, Job, PaginatedResponse,
  AnalysisListItem, AnalysisDetail, AnalysisStats, HealthCheck,
  InterviewResult, FraudResult, BiasBlindScoreResult, BiasCompareResult,
  NotificationItem, NotificationStats, JobApplication, ProfileData,
  AdminStats, TeamData, ResumeAnalysisFullResponse,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Unable to connect to the server. The backend may be offline.", 0);
  }

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.detail || data.message || message;
      if (Array.isArray(data.detail)) {
        message = data.detail.map((e: { msg: string }) => e.msg).join("; ");
      }
    } catch {
      // body not JSON
    }
    throw new ApiError(message, res.status);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return {} as T;
}

function formData(fields: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (value instanceof File) {
      fd.append(key, value);
    } else if (Array.isArray(value)) {
      fd.append(key, JSON.stringify(value));
    } else if (typeof value === "object") {
      fd.append(key, JSON.stringify(value));
    } else {
      fd.append(key, String(value));
    }
  }
  return fd;
}

export const api = {
  // Public
  health: () => request<HealthCheck>("/api/v1/health"),

  // Auth
  getCompanies: () => request<Company[]>("/api/v1/auth/companies"),
  register: (body: {
    email: string; password: string; full_name?: string; username?: string;
    role: string; company_name?: string;
  }) => request<User>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  login: (email: string, password: string) => {
    clearToken();
    return request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }).then((res) => {
      setToken(res.access_token);
      return res;
    });
  },
  getMe: () => request<User>("/api/v1/auth/me"),
  updateMe: (body: Partial<User>) => request<User>("/api/v1/auth/me", {
    method: "PUT",
    body: JSON.stringify(body),
  }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean; message: string }>("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  logout: () => {
    const p = request<{ success: boolean }>("/api/v1/auth/logout", { method: "POST" });
    clearToken();
    return p;
  },
  adminUsers: () => request<User[]>("/api/v1/auth/admin/users"),
  adminStats: () => request<AdminStats>("/api/v1/auth/admin/stats"),
  toggleUser: (id: number) =>
    request<{ success: boolean; is_active: boolean }>(`/api/v1/auth/admin/users/${id}/toggle`, { method: "PATCH" }),
  deleteUser: (id: number) =>
    request<{ success: boolean }>(`/api/v1/auth/admin/users/${id}`, { method: "DELETE" }),
  team: () => request<TeamData>("/api/v1/auth/company-admin/team"),
  approveUser: (id: number) =>
    request<{ success: boolean }>(`/api/v1/auth/company-admin/approve/${id}`, { method: "POST" }),
  rejectUser: (id: number) =>
    request<{ success: boolean }>(`/api/v1/auth/company-admin/reject/${id}`, { method: "POST" }),

  // Jobs
  jobs: (page = 1, perPage = 10, search?: string, jobType?: string) => {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (search) params.set("search", search);
    if (jobType) params.set("job_type", jobType);
    return request<PaginatedResponse<Job>>(`/api/v1/jobs/?${params}`);
  },
  getJob: (id: number) => request<Job>(`/api/v1/jobs/${id}`),
  createJob: (body: Record<string, unknown>) => request<Job>("/api/v1/jobs/", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  deleteJob: (id: number) => request<{ success: boolean }>(`/api/v1/jobs/${id}`, { method: "DELETE" }),

  // Analysis
  analysisList: (page = 1, perPage = 10) => {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    return request<PaginatedResponse<AnalysisListItem>>(`/api/v1/analysis/?${params}`);
  },
  analysisDetail: (id: number) => request<AnalysisDetail>(`/api/v1/analysis/${id}`),
  analysisStats: () => request<AnalysisStats>("/api/v1/analysis/stats/summary"),
  deleteAnalysis: (id: number) => request<{ success: boolean }>(`/api/v1/analysis/${id}`, { method: "DELETE" }),
  analyzeResume: (file: File, jobDescription?: string, jobId?: number) => {
    const fd = formData({ file, job_description: jobDescription, job_id: jobId, save_to_db: true });
    return request<ResumeAnalysisFullResponse>("/api/v1/analysis/analyze", { method: "POST", body: fd });
  },

  // Interview
  generateInterview: (file: File, jobDescription?: string, maxQuestions = 20) => {
    const fd = formData({ file, job_description: jobDescription, max_questions: maxQuestions });
    return request<InterviewResult>("/api/v1/interview/generate", { method: "POST", body: fd });
  },

  // Fraud
  detectFraud: (file: File) => {
    const fd = formData({ file });
    return request<FraudResult>("/api/v1/fraud/detect", { method: "POST", body: fd });
  },

  // Bias
  blindScore: (file: File, jobDescription?: string) => {
    const fd = formData({ file, job_description: jobDescription });
    return request<BiasBlindScoreResult>("/api/v1/bias/blind-score", { method: "POST", body: fd });
  },
  compareBias: (file: File, jobDescription?: string) => {
    const fd = formData({ file, job_description: jobDescription });
    return request<BiasCompareResult>("/api/v1/bias/compare", { method: "POST", body: fd });
  },

  // Notifications
  notificationFeed: () => request<{ total: number; notifications: NotificationItem[] }>("/api/v1/notifications/feed"),
  notificationStats: () => request<NotificationStats>("/api/v1/notifications/stats"),
  myApplications: () => request<{ total: number; applications: JobApplication[] }>("/api/v1/notifications/my-applications"),
  apply: (notificationId: number, positionTitle: string, company: string, coverNote: string, file: File) => {
    const fd = formData({ notification_id: notificationId, position_title: positionTitle, company, cover_note: coverNote, file });
    return request<{ success: boolean; application_id: number }>("/api/v1/notifications/apply", { method: "POST", body: fd });
  },

  // Profile
  getProfile: () => request<ProfileData>("/api/v1/profile/me"),
  updateProfile: (body: Record<string, string>) => request<ProfileData>("/api/v1/profile/me", {
    method: "PUT",
    body: JSON.stringify(body),
  }),
  uploadPhoto: (file: File) => {
    const fd = formData({ file });
    return request<ProfileData>("/api/v1/profile/photo", { method: "POST", body: fd });
  },
  deletePhoto: () => request<ProfileData>("/api/v1/profile/photo", { method: "DELETE" }),
};
