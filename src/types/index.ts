// Types matching the FastAPI backend Pydantic schemas

export type UserRole = "recruiter" | "hiring_manager" | "admin" | "company_admin" | "candidate";
export type JobType = "full_time" | "part_time" | "contract" | "internship" | "remote" | "hybrid";
export type Priority = "high" | "medium" | "low";

export interface User {
  id: number;
  email: string;
  username: string;
  full_name: string | null;
  company_name: string | null;
  role: UserRole;
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

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Company {
  name: string;
  recruiter_domain: string;
}

export interface Job {
  id: number;
  user_id: number;
  title: string;
  company: string | null;
  department: string | null;
  location: string | null;
  job_type: JobType;
  description: string;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
  min_experience: number | null;
  max_experience: number | null;
  education_level: string | null;
  salary_min: number | null;
  salary_max: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface AnalysisListItem {
  id: number;
  user_id: number | null;
  job_id: number | null;
  filename: string;
  candidate_name: string | null;
  candidate_email: string | null;
  candidate_phone: string | null;
  overall_score: number;
  keyword_score: number;
  skill_score: number;
  structure_score: number;
  semantic_score: number;
  experience_score: number;
  education_score: number;
  detected_domain: string | null;
  status: string;
  created_at: string;
}

export interface AnalysisDetail extends AnalysisListItem {
  extracted_text: string | null;
  matched_keywords: string | null;
  matched_skills: string | null;
  missing_skills: string | null;
  recommendations: string | null;
  analysis_data: string | null;
}

export interface ResumeAnalysisResponse {
  analysis_id: number | null;
  filename: string;
  file_type: string;
  extracted_text_length: number;
  overall_score: number;
  keyword_match_score: number;
  skill_match_score: number;
  structure_score: number;
  semantic_similarity: number | null;
  keywords: string[];
  skills: string[];
  recommendations: Recommendation[];
  breakdown: Record<string, unknown>;
  detected_domain: string;
  india_context_bonus: number;
  indian_context: Record<string, unknown>;
  nlp_analysis: Record<string, unknown>;
  status: string;
  created_at?: string;
}

export interface ResumeAnalysisFullResponse {
  analysis_id: number;
  filename: string;
  extracted_text_length: number;
  candidate_name: string | null;
  candidate_email: string | null;
  overall_score: number;
  keyword_match_score: number;
  skill_match_score: number;
  structure_score: number;
  semantic_similarity: number | null;
  experience_score: number;
  education_score: number;
  accuracy_estimate: number;
  nlp_analysis: Record<string, unknown>;
  breakdown: Record<string, unknown>;
  status: string;
  created_at: string | null;
}

export interface SkillMatch {
  skill: string;
  category: string;
  matched: boolean;
  confidence: number;
}

export interface KeywordMatch {
  keyword: string;
  matched: boolean;
  score: number;
}

export interface Recommendation {
  category: string;
  suggestion: string;
  priority: Priority;
}

export interface AnalysisStats {
  total_analyses: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  score_distribution: Record<string, number>;
  recent_activity_7_days: number;
  total_jobs: number;
  total_datasets: number;
  top_skills_found: string[];
}

export interface HealthCheck {
  status: string;
  version: string;
  database: string;
  services: Record<string, string>;
  timestamp: string;
}

export interface InterviewResult {
  total_questions: number;
  experience_level: string;
  detected_domain: string;
  detected_skills: string[];
  questions: { category: string; question: string }[];
  categories: Record<string, string[]>;
  category_list: string[];
  filename: string;
}

export interface FraudResult {
  fraud_score: number;
  risk_level: string;
  total_flags: number;
  high_severity: number;
  medium_severity: number;
  low_severity: number;
  flags: { type: string; severity: string; message: string; detail: string }[];
  recommendations: string[];
  summary: string;
  filename: string;
}

export interface BiasAnonymizeResult {
  filename: string;
  original_length: number;
  anonymized_length: number;
  anonymized_text: string;
  removal_report: {
    emails: string[];
    phones: string[];
    urls: string[];
    gender_markers: string[];
    age_dob: string[];
    religion_caste: string[];
    marital_status: string[];
    personal_info_lines: string[];
    honorifics: number;
    name_detected: string | null;
    total_items_removed: number;
  };
  candidate_id: string;
}

export interface BiasBlindScoreResult {
  mode: string;
  pii_removed: boolean;
  overall_score: number;
  keyword_match_score: number;
  skill_match_score: number;
  structure_score: number;
  breakdown: Record<string, unknown>;
  removal_report: Record<string, unknown>;
  filename: string;
}

export interface BiasCompareResult {
  pii_removed: boolean;
  removal_report: Record<string, unknown>;
  original_score: number;
  blind_score: number;
  score_difference: number;
  bias_detected: boolean;
  bias_interpretation: string;
  recommendation: string;
  filename: string;
}

export interface NotificationItem {
  id: number;
  position_title: string;
  company: string;
  location: string | null;
  job_type: string | null;
  openings: number;
  eligibility: string | null;
  posted_date: string;
  already_applied: number[];
}

export interface NotificationStats {
  total_companies: number;
  total_positions: number;
  total_openings: number;
  total_applications: number;
}

export interface JobApplication {
  id: number;
  notification_id: number;
  company: string;
  position_title: string;
  resume_filename: string;
  status: string;
  created_at: string;
}

export interface ProfileData {
  id: number;
  user_id: number;
  email: string;
  username: string;
  full_name: string | null;
  role: UserRole;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  photo_url: string | null;
  profile_complete: boolean;
  has_photo: boolean;
  profile_updated_at: string | null;
  created_at: string;
}

export interface AdminStats {
  total_users: number;
  active_users: number;
  total_analyses: number;
  avg_score: number;
  total_jobs: number;
  users_by_role: Record<string, number>;
}

export interface TeamData {
  company: string;
  total: number;
  recruiters: User[];
}
