import { extractTextFromFile } from "./parser";
import { calculateAtsScore, type ScoringResult } from "./scoring";

export interface RemovalReport {
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
}

export function anonymizeResume(text: string): { anonymizedText: string; report: RemovalReport } {
  const report: RemovalReport = {
    emails: [],
    phones: [],
    urls: [],
    gender_markers: [],
    age_dob: [],
    religion_caste: [],
    marital_status: [],
    personal_info_lines: [],
    honorifics: 0,
    name_detected: null,
    total_items_removed: 0,
  };

  let result = text;

  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  report.emails = result.match(emailRegex) || [];
  result = result.replace(emailRegex, "[EMAIL]");

  const phoneRegex = /(?:\+91[\s.-]?)?(?:\d{5}[\s.-]?\d{5}|\d{3}[\s.-]?\d{3}[\s.-]?\d{4}|\d{10})/g;
  report.phones = result.match(phoneRegex) || [];
  result = result.replace(phoneRegex, "[PHONE]");

  const urlRegex = /https?:\/\/[^\s]+/g;
  report.urls = result.match(urlRegex) || [];
  result = result.replace(urlRegex, "[URL]");

  const linkedinRegex = /(?:linkedin\.com\/(?:in|pub)\/[A-Za-z0-9_-]+)/gi;
  result = result.replace(linkedinRegex, "[LINKEDIN]");

  const githubRegex = /(?:github\.com\/[A-Za-z0-9_-]+)/gi;
  result = result.replace(githubRegex, "[GITHUB]");

  const genderMarkers = /\b(?:he\/she|his\/her|son of|daughter of|mr\.|mrs\.|miss|ms\.|sir|madam)\b/gi;
  report.gender_markers = result.match(genderMarkers) || [];
  result = result.replace(genderMarkers, "[GENDER]");

  const dobRegex = /\b(?:date of birth|dob|born on|age)[:\s]*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/gi;
  report.age_dob = result.match(dobRegex) || [];
  result = result.replace(dobRegex, "[DOB]");
  result = result.replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/g, "[DATE]");

  const religionRegex = /\b(?:hindu|muslim|christian|sikh|jain|buddhist|religion|caste|community)\b/gi;
  report.religion_caste = result.match(religionRegex) || [];
  result = result.replace(religionRegex, "[REDACTED]");

  const maritalRegex = /\b(?:single|married|unmarried|divorced|widowed|marital status)\b/gi;
  report.marital_status = result.match(maritalRegex) || [];
  result = result.replace(maritalRegex, "[REDACTED]");

  const honorificRegex = /\b(?:mr|mrs|miss|ms|dr|prof)\.\s+[A-Z][a-z]+/g;
  const honorificMatches = result.match(honorificRegex) || [];
  report.honorifics = honorificMatches.length;
  result = result.replace(honorificRegex, "[NAME]");

  const lines = result.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const firstLine = lines[0];
    if (firstLine.length >= 2 && firstLine.length <= 60 && /^[A-Z][a-zA-Z.\s-]+$/.test(firstLine) && firstLine.split(/\s+/).length >= 2 && firstLine.split(/\s+/).length <= 4) {
      report.name_detected = firstLine;
      result = result.replace(firstLine, "[NAME]");
    }
  }

  report.total_items_removed =
    report.emails.length +
    report.phones.length +
    report.urls.length +
    report.gender_markers.length +
    report.age_dob.length +
    report.religion_caste.length +
    report.marital_status.length +
    report.honorifics +
    (report.name_detected ? 1 : 0);

  return { anonymizedText: result, report };
}

export async function blindScore(
  file: File,
  jobDescription?: string,
): Promise<{
  mode: string;
  pii_removed: boolean;
  overall_score: number;
  keyword_match_score: number;
  skill_match_score: number;
  structure_score: number;
  breakdown: Record<string, unknown>;
  removal_report: Record<string, unknown>;
  filename: string;
}> {
  const text = await extractTextFromFile(file);
  const { anonymizedText, report } = anonymizeResume(text);
  const score = calculateAtsScore(anonymizedText, jobDescription);

  return {
    mode: "blind",
    pii_removed: report.total_items_removed > 0,
    overall_score: score.overall_score,
    keyword_match_score: score.keyword_match_score,
    skill_match_score: score.skill_match_score,
    structure_score: score.structure_score,
    breakdown: score.breakdown,
    removal_report: report,
    filename: file.name,
  };
}

export async function compareBias(
  file: File,
  jobDescription?: string,
): Promise<{
  pii_removed: boolean;
  removal_report: Record<string, unknown>;
  original_score: number;
  blind_score_val: number;
  blind_score: number;
  score_difference: number;
  bias_detected: boolean;
  bias_interpretation: string;
  recommendation: string;
  filename: string;
}> {
  const text = await extractTextFromFile(file);
  const originalScore = calculateAtsScore(text, jobDescription);
  const { anonymizedText, report } = anonymizeResume(text);
  const blindScoreResult = calculateAtsScore(anonymizedText, jobDescription);

  const diff = originalScore.overall_score - blindScoreResult.overall_score;
  const biasDetected = Math.abs(diff) >= 5;

  let interpretation = "";
  let recommendation = "";

  if (!biasDetected) {
    interpretation = "No significant bias detected. The score difference between the original and anonymized resume is within acceptable range (less than 5 points).";
    recommendation = "Your scoring process appears fair. Continue using blind screening as a best practice.";
  } else if (diff > 0) {
    interpretation = `Potential bias detected. The original resume scored ${diff} points higher than the anonymized version, suggesting that personal information (name, gender, contact details) may be positively influencing the score.`;
    recommendation = "Consider implementing blind screening to reduce unconscious bias in your evaluation process.";
  } else {
    interpretation = `Potential bias detected. The anonymized resume scored ${Math.abs(diff)} points higher than the original, suggesting that personal information may be negatively impacting the candidate's score.`;
    recommendation = "Review your scoring criteria for fairness. The candidate's personal details appear to be working against them.";
  }

  return {
    pii_removed: report.total_items_removed > 0,
    removal_report: report,
    original_score: originalScore.overall_score,
    blind_score_val: blindScoreResult.overall_score,
    blind_score: blindScoreResult.overall_score,
    score_difference: diff,
    bias_detected: biasDetected,
    bias_interpretation: interpretation,
    recommendation,
    filename: file.name,
  };
}

export function analyzeJobDescriptionBias(jd: string): {
  bias_terms: { type: string; term: string }[];
  tone: string;
  recommendation: string;
} {
  const biasTerms: { type: string; term: string }[] = [];
  const lower = jd.toLowerCase();

  const ageTerms = ["young", "energetic", "fresh", "recent graduate", "digital native", "youthful"];
  for (const t of ageTerms) {
    if (lower.includes(t)) biasTerms.push({ type: "age", term: t });
  }

  const genderTerms = ["he", "him", "his", "she", "her", "man", "woman", "guys", "salesman"];
  for (const t of genderTerms) {
    if (lower.includes(t)) biasTerms.push({ type: "gender", term: t });
  }

  const disabilityTerms = ["able-bodied", "physically fit", "no disabilities", "must be able to walk", "must be able to lift"];
  for (const t of disabilityTerms) {
    if (lower.includes(t)) biasTerms.push({ type: "disability", term: t });
  }

  const maritalTerms = ["single", "married", "no family commitments", "willing to relocate", "no children"];
  for (const t of maritalTerms) {
    if (lower.includes(t)) biasTerms.push({ type: "marital", term: t });
  }

  const languageTerms = ["native english", "fluent english", "english mother tongue", "no accent"];
  for (const t of languageTerms) {
    if (lower.includes(t)) biasTerms.push({ type: "language", term: t });
  }

  let tone = "neutral";
  if (biasTerms.length > 5) tone = "potentially biased";
  else if (biasTerms.length > 0) tone = "slightly biased";

  let recommendation = "The job description appears neutral and inclusive.";
  if (biasTerms.length > 0) {
    recommendation = `Consider revising ${biasTerms.length} potentially biased terms to make the job description more inclusive.`;
  }

  return { bias_terms: biasTerms, tone, recommendation };
}
