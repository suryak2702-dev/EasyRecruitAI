import {
  extractSkillsFromText,
  detectDomain,
  tokenize,
  extractKeywords,
  analyzeTextStructure,
  detectIndianContext,
} from "./skill-extractor";
import {
  DOMAIN_SKILLS,
  INDIAN_CERT_PATTERNS,
  INDIAN_COMPANIES,
  ACTION_VERBS,
} from "./skill-data";

export interface ScoringResult {
  overall_score: number;
  keyword_match_score: number;
  skill_match_score: number;
  structure_score: number;
  semantic_similarity: number;
  experience_score: number;
  education_score: number;
  accuracy_estimate: number;
  detected_domain: string;
  domain_confidence: number;
  is_likely_resume: boolean;
  breakdown: {
    keywords: string[];
    skill_analysis: {
      matched_skills: string[];
      missing_skills: string[];
      total_required: number;
      match_count: number;
    };
    recommendations: { category: string; suggestion: string; priority: string }[];
  };
}

export function calculateAtsScore(
  resumeText: string,
  jobDescription?: string | null,
): ScoringResult {
  const resumeSkills = extractSkillsFromText(resumeText);
  const { domain, confidence } = detectDomain(resumeText);
  const structure = analyzeTextStructure(resumeText);

  const isResume = structure.sectionCount >= 2 || structure.wordCount > 100;

  let keywordScore = 0;
  let skillScore = 0;
  let semanticScore = 0;
  let structScore = 0;
  let expScore = 0;
  let eduScore = 0;

  const resumeKeywords = extractKeywords(resumeText, 50);

  if (jobDescription && jobDescription.trim().length > 10) {
    const jdSkills = extractSkillsFromText(jobDescription);
    const jdKeywords = extractKeywords(jobDescription, 50);

    const matchedSkills = jdSkills.filter((s) => resumeSkills.includes(s));
    const missingSkills = jdSkills.filter((s) => !resumeSkills.includes(s));
    skillScore = jdSkills.length > 0 ? Math.round((matchedSkills.length / jdSkills.length) * 100) : 0;

    const matchedKw = jdKeywords.filter((k) => resumeKeywords.includes(k));
    keywordScore = jdKeywords.length > 0 ? Math.round((matchedKw.length / jdKeywords.length) * 100) : 0;

    semanticScore = tfidfCosineSimilarity(resumeText, jobDescription);
  } else {
    const domainSkills = DOMAIN_SKILLS[domain] || DOMAIN_SKILLS.general;
    const matchedSkills = domainSkills.filter((s) => resumeSkills.includes(s));
    skillScore = Math.round((matchedSkills.length / Math.max(domainSkills.length, 1)) * 100);
    skillScore = Math.min(skillScore * 3, 100);

    keywordScore = Math.min(Math.round(resumeKeywords.length / 50 * 100), 100);
    semanticScore = 0;
  }

  structScore = calculateStructureScore(structure);
  expScore = calculateExperienceScore(resumeText);
  eduScore = calculateEducationScore(resumeText);

  const { isIndian } = detectIndianContext(resumeText);
  let indiaBonus = 0;
  if (isIndian) {
    indiaBonus = calculateIndiaBonus(resumeText);
  }

  let overall: number;
  if (jobDescription && jobDescription.trim().length > 10) {
    overall =
      keywordScore * 0.20 +
      skillScore * 0.25 +
      structScore * 0.15 +
      semanticScore * 0.20 +
      expScore * 0.10 +
      eduScore * 0.10;
  } else {
    overall =
      keywordScore * 0.25 +
      skillScore * 0.30 +
      structScore * 0.20 +
      expScore * 0.15 +
      eduScore * 0.10;
  }

  overall = Math.round(Math.min(overall + indiaBonus, 100));
  if (!isResume) overall = Math.round(overall * 0.5);

  const matchedSkills = jobDescription
    ? extractSkillsFromText(jobDescription).filter((s) => resumeSkills.includes(s))
    : resumeSkills;
  const missingSkills = jobDescription
    ? extractSkillsFromText(jobDescription).filter((s) => !resumeSkills.includes(s))
    : (DOMAIN_SKILLS[domain] || []).filter((s) => !resumeSkills.includes(s)).slice(0, 10);

  const recommendations = generateRecommendations({
    keywordScore,
    skillScore,
    structScore,
    expScore,
    eduScore,
    semanticScore,
    matchedSkills,
    missingSkills,
    structure,
    hasJobDescription: !!jobDescription,
  });

  const accuracy = Math.round(
    65 +
      Math.min(structure.wordCount / 20, 15) +
      (isResume ? 10 : 0) +
      (resumeSkills.length > 5 ? 10 : resumeSkills.length),
  );

  return {
    overall_score: overall,
    keyword_match_score: keywordScore,
    skill_match_score: skillScore,
    structure_score: structScore,
    semantic_similarity: semanticScore,
    experience_score: expScore,
    education_score: eduScore,
    accuracy_estimate: Math.min(accuracy, 98),
    detected_domain: domain,
    domain_confidence: confidence,
    is_likely_resume: isResume,
    breakdown: {
      keywords: resumeKeywords.slice(0, 20),
      skill_analysis: {
        matched_skills: matchedSkills,
        missing_skills: missingSkills.slice(0, 15),
        total_required: matchedSkills.length + missingSkills.length,
        match_count: matchedSkills.length,
      },
      recommendations,
    },
  };
}

function calculateStructureScore(struct: {
  sectionCount: number;
  bulletCount: number;
  actionVerbCount: number;
  wordCount: number;
  hasBulletPoints: boolean;
  hasActionVerbs: boolean;
}): number {
  let score = 0;
  score += Math.min(struct.sectionCount * 12, 48);
  score += struct.hasBulletPoints ? 20 : 0;
  score += struct.hasActionVerbs ? 15 : 0;
  score += struct.wordCount > 200 ? 10 : struct.wordCount > 100 ? 7 : 3;
  score += struct.bulletCount > 5 ? 7 : struct.bulletCount > 0 ? 4 : 0;
  return Math.min(score, 100);
}

function calculateExperienceScore(text: string): number {
  const yearsMatch = text.match(/(\d+)\+?\s*(?:years|yrs)/gi);
  let years = 0;
  if (yearsMatch) {
    for (const m of yearsMatch) {
      const n = parseInt(m, 10);
      if (n > years) years = n;
    }
  }

  const dateRanges = text.match(/\b(20\d{2})\s*[-–—to]+\s*(20\d{2}|present|current|now)\b/gi) || [];
  if (years === 0 && dateRanges.length > 0) {
    years = dateRanges.length * 2;
  }

  if (years >= 10) return 95;
  if (years >= 7) return 88;
  if (years >= 5) return 80;
  if (years >= 3) return 70;
  if (years >= 1) return 55;
  if (years > 0) return 40;

  const internMatch = text.match(/\bintern(ship)?\b/gi);
  if (internMatch) return 35;

  const projectMatch = text.match(/\bproject\b/gi);
  if (projectMatch && projectMatch.length >= 2) return 30;

  return 20;
}

function calculateEducationScore(text: string): number {
  let score = 0;
  if (/\b(?:ph\.?d|doctorate|postdoc)\b/i.test(text)) score = 95;
  else if (/\b(?:m\.?tech|m\.?e|m\.?sc|msc|master)/i.test(text)) score = 85;
  else if (/\b(?:mba|pgdm|post graduate|postgraduate)\b/i.test(text)) score = 82;
  else if (/\b(?:b\.?tech|b\.?e|bachelor of (?:engineering|technology))\b/i.test(text)) score = 75;
  else if (/\b(?:b\.?sc|bachelor of science)\b/i.test(text)) score = 65;
  else if (/\b(?:b\.?com|bachelor of commerce)\b/i.test(text)) score = 60;
  else if (/\b(?:bca|bachelor of computer)\b/i.test(text)) score = 60;
  else if (/\b(?:m\.?ca|master of computer)\b/i.test(text)) score = 70;
  else if (/\b(?:b\.?a|bachelor of arts)\b/i.test(text)) score = 50;
  else if (/\b(?:diploma|iti)\b/i.test(text)) score = 45;
  else if (/\b(?:degree|graduation|graduate)\b/i.test(text)) score = 55;
  else score = 30;

  for (const cert of INDIAN_CERT_PATTERNS) {
    if (cert.regex.test(text) && cert.tier >= 4) {
      score = Math.min(score + 10, 100);
      break;
    }
  }

  if (/\b(?:gpa|cgpa)\s*:?\s*(3\.\d|4\.0|9\.\d|8\.\d|7\.\d)/i.test(text)) {
    score = Math.min(score + 5, 100);
  }

  return score;
}

function calculateIndiaBonus(text: string): number {
  let bonus = 0;
  for (const cert of INDIAN_CERT_PATTERNS) {
    if (cert.regex.test(text)) {
      bonus += Math.min(cert.tier * 2, 10);
      break;
    }
  }
  const lower = text.toLowerCase();
  for (const company of INDIAN_COMPANIES) {
    if (lower.includes(company)) {
      bonus += 3;
      break;
    }
  }
  if (/\b(?:aws certified|azure certified|gcp certified|pmp|scrum|six sigma|salesforce certified)\b/i.test(text)) {
    bonus += 3;
  }
  return Math.min(bonus, 10);
}

export function tfidfCosineSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const allTokens = [...new Set([...tokens1, ...tokens2])];

  const tf1: Record<string, number> = {};
  const tf2: Record<string, number> = {};
  for (const t of tokens1) tf1[t] = (tf1[t] || 0) + 1;
  for (const t of tokens2) tf2[t] = (tf2[t] || 0) + 1;

  const docFreq: Record<string, number> = {};
  for (const t of allTokens) {
    let df = 0;
    if (tf1[t]) df++;
    if (tf2[t]) df++;
    docFreq[t] = df;
  }

  const totalDocs = 2;
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (const t of allTokens) {
    const idf = Math.log((totalDocs + 1) / (docFreq[t] + 1)) + 1;
    const w1 = (tf1[t] || 0) / tokens1.length * idf;
    const w2 = (tf2[t] || 0) / tokens2.length * idf;
    dotProduct += w1 * w2;
    mag1 += w1 * w1;
    mag2 += w2 * w2;
  }

  if (mag1 === 0 || mag2 === 0) return 0;
  return Math.round((dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2))) * 100);
}

function generateRecommendations(params: {
  keywordScore: number;
  skillScore: number;
  structScore: number;
  expScore: number;
  eduScore: number;
  semanticScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  structure: { sectionCount: number; bulletCount: number; hasBulletPoints: boolean; hasActionVerbs: boolean; wordCount: number };
  hasJobDescription: boolean;
}): { category: string; suggestion: string; priority: string }[] {
  const recs: { category: string; suggestion: string; priority: string }[] = [];

  if (params.skillScore < 50 && params.missingSkills.length > 0) {
    recs.push({
      category: "skills",
      suggestion: `Add these missing skills to your resume: ${params.missingSkills.slice(0, 5).join(", ")}. Tailor your skills section to match the job requirements.`,
      priority: "high",
    });
  }

  if (params.keywordScore < 50) {
    recs.push({
      category: "keywords",
      suggestion: "Include more keywords from the job description. Use exact terms and industry-standard terminology.",
      priority: "high",
    });
  }

  if (params.structScore < 60) {
    if (params.structure.sectionCount < 3) {
      recs.push({
        category: "structure",
        suggestion: "Add clear section headers (Experience, Education, Skills, Projects) to improve readability and ATS parsing.",
        priority: "medium",
      });
    }
    if (!params.structure.hasBulletPoints) {
      recs.push({
        category: "structure",
        suggestion: "Use bullet points to describe your experience and achievements. Avoid long paragraphs.",
        priority: "medium",
      });
    }
    if (!params.structure.hasActionVerbs) {
      recs.push({
        category: "structure",
        suggestion: "Start bullet points with strong action verbs (Developed, Designed, Led, Optimized, etc.).",
        priority: "low",
      });
    }
  }

  if (params.expScore < 50) {
    recs.push({
      category: "experience",
      suggestion: "Quantify your experience with specific durations (e.g., '3 years of experience in Python development').",
      priority: "medium",
    });
  }

  if (params.eduScore < 50) {
    recs.push({
      category: "education",
      suggestion: "Clearly state your highest degree, institution name, and graduation year.",
      priority: "low",
    });
  }

  if (params.hasJobDescription && params.semanticScore < 40) {
    recs.push({
      category: "semantic",
      suggestion: "The overall content of your resume doesn't closely match the job description. Reframe your experience using similar language.",
      priority: "medium",
    });
  }

  if (params.structure.wordCount < 100) {
    recs.push({
      category: "content",
      suggestion: "Your resume appears too brief. Add more detail about your projects, responsibilities, and achievements.",
      priority: "high",
    });
  }

  if (recs.length === 0) {
    recs.push({
      category: "general",
      suggestion: "Your resume looks well-structured. Continue tailoring it for each job application.",
      priority: "low",
    });
  }

  return recs;
}
