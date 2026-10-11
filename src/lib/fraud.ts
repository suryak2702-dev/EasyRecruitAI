import { extractTextFromFile } from "./parser";

export interface FraudFlag {
  type: string;
  severity: string;
  message: string;
  detail: string;
}

export interface FraudResult {
  fraud_score: number;
  risk_level: string;
  total_flags: number;
  high_severity: number;
  medium_severity: number;
  low_severity: number;
  flags: FraudFlag[];
  recommendations: string[];
  summary: string;
  filename: string;
}

export async function detectFraud(file: File): Promise<FraudResult> {
  const text = await extractTextFromFile(file);
  const flags: FraudFlag[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  if (text.trim().length < 50) {
    flags.push({
      type: "insufficient_content",
      severity: "high",
      message: "Insufficient content",
      detail: "The resume contains very little text, which may indicate a template or incomplete document.",
    });
  }

  const emailMatches = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g) || [];
  if (emailMatches.length > 1) {
    flags.push({
      type: "multiple_emails",
      severity: "medium",
      message: "Multiple email addresses found",
      detail: `${emailMatches.length} email addresses detected: ${emailMatches.slice(0, 3).join(", ")}`,
    });
  }

  const phoneMatches = text.match(/(?:\+91[\s.-]?)?(?:\d{5}[\s.-]?\d{5}|\d{3}[\s.-]?\d{3}[\s.-]?\d{4}|\d{10})/g) || [];
  if (phoneMatches.length > 2) {
    flags.push({
      type: "multiple_phones",
      severity: "low",
      message: "Multiple phone numbers found",
      detail: `${phoneMatches.length} phone numbers detected.`,
    });
  }

  const words = text.toLowerCase().split(/\s+/);
  const wordFreq: Record<string, number> = {};
  for (const w of words) {
    if (w.length > 3) wordFreq[w] = (wordFreq[w] || 0) + 1;
  }
  const repeatedWords = Object.entries(wordFreq).filter(([, c]) => c > 15);
  if (repeatedWords.length > 3) {
    flags.push({
      type: "excessive_repetition",
      severity: "medium",
      message: "Excessive word repetition",
      detail: `Words repeated >15 times: ${repeatedWords.map(([w, c]) => `${w}(${c})`).slice(0, 5).join(", ")}`,
    });
  }

  const skillList = text.match(/(?:skills|technologies|tools)[:\s]+([^\n]+)/i);
  if (skillList) {
    const skills = skillList[1].split(/[,\s|]+/).filter(Boolean);
    if (skills.length > 40) {
      flags.push({
        type: "skill_stuffing",
        severity: "medium",
        message: "Skill stuffing detected",
        detail: `${skills.length} skills listed in a single section. This is unusually high and may indicate keyword stuffing.`,
      });
    }
  }

  const yearsMatches = text.match(/(\d+)\+?\s*(?:years|yrs)/gi) || [];
  let maxYears = 0;
  for (const m of yearsMatches) {
    const n = parseInt(m, 10);
    if (n > maxYears) maxYears = n;
  }
  if (maxYears > 40) {
    flags.push({
      type: "unrealistic_experience",
      severity: "high",
      message: "Unrealistic experience duration",
      detail: `Claims ${maxYears} years of experience, which is implausible.`,
    });
  }

  const dateRanges = text.matchAll(/(\d{4})\s*[-–—to]+\s*(\d{4}|present|current|now)/gi);
  for (const match of dateRanges) {
    const start = parseInt(match[1], 10);
    const end = match[2].toLowerCase();
    if (end.match(/\d{4}/)) {
      const endYear = parseInt(end, 10);
      if (endYear < start) {
        flags.push({
          type: "chronology_error",
          severity: "high",
          message: "Chronology error in dates",
          detail: `End date (${endYear}) is before start date (${start}).`,
        });
        break;
      }
      const duration = endYear - start;
      if (duration > 15) {
        flags.push({
          type: "unrealistic_duration",
          severity: "medium",
          message: "Unrealistically long tenure",
          detail: `One role spans ${duration} years (${start}-${endYear}).`,
        });
        break;
      }
    }
  }

  const suspiciousPatterns = [
    { regex: /\b(?:fresher|0 experience)\b.*\b(?:senior|lead|architect|manager)\b/i, msg: "Claims senior role with no experience" },
    { regex: /\b(?:student|studying)\b.*\b(?:vp|vice president|director|cto|ceo)\b/i, msg: "Claims executive role while being a student" },
  ];
  for (const p of suspiciousPatterns) {
    if (p.regex.test(text)) {
      flags.push({
        type: "suspicious_pattern",
        severity: "high",
        message: p.msg,
        detail: "The resume contains contradictory role/experience claims.",
      });
    }
  }

  const unlikelyEmployers = /\b(?:google|microsoft|amazon|apple|meta|facebook)\b.*\b(?:intern|internship)\b/i;
  if (unlikelyEmployers.test(text) && maxYears === 0) {
    flags.push({
      type: "unlikely_employer",
      severity: "low",
      message: "Claims internship at top-tier company",
      detail: "Claims internship at a major tech company. Verify through references.",
    });
  }

  let score = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const f of flags) {
    if (f.severity === "high") { score += 25; high++; }
    else if (f.severity === "medium") { score += 12; medium++; }
    else { score += 5; low++; }
  }
  score = Math.min(score, 100);

  let riskLevel = "clean";
  if (score >= 60) riskLevel = "very_high_risk";
  else if (score >= 40) riskLevel = "high_risk";
  else if (score >= 25) riskLevel = "moderate_risk";
  else if (score >= 10) riskLevel = "low_risk";

  const recommendations: string[] = [];
  if (high > 0) recommendations.push("Verify all claims through background checks and reference calls.");
  if (medium > 0) recommendations.push("Ask clarifying questions about experience gaps and skill claims during the interview.");
  if (score < 10) recommendations.push("No significant fraud indicators detected. Proceed with normal screening.");

  const summary = `Fraud analysis complete. Risk level: ${riskLevel}. ${flags.length} flag(s) detected (${high} high, ${medium} medium, ${low} low).`;

  return {
    fraud_score: score,
    risk_level: riskLevel,
    total_flags: flags.length,
    high_severity: high,
    medium_severity: medium,
    low_severity: low,
    flags,
    recommendations,
    summary,
    filename: file.name,
  };
}
