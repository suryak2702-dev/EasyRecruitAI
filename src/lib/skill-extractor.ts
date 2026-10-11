import { FILLER_WORDS, SKILL_ALIASES, DOMAIN_SKILLS, ACTION_VERBS } from "./skill-data";

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s+.#-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function extractKeywords(text: string, maxCount = 30): string[] {
  const tokens = tokenize(text);
  const freq: Record<string, number> = {};
  for (const token of tokens) {
    if (FILLER_WORDS.has(token) || token.length < 2) continue;
    freq[token] = (freq[token] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([word]) => word);
}

export function extractSkillsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  const allSkills = new Set<string>();
  for (const skills of Object.values(DOMAIN_SKILLS)) {
    for (const s of skills) allSkills.add(s);
  }
  for (const canonical of Object.values(SKILL_ALIASES)) allSkills.add(canonical);

  for (const skill of allSkills) {
    const patterns = [skill];
    for (const [alias, canonical] of Object.entries(SKILL_ALIASES)) {
      if (canonical === skill) patterns.push(alias);
    }
    for (const p of patterns) {
      const regex = new RegExp(`(?:^|[\\s,;:|/()\\[\\]{}])${escapeRegex(p)}(?:$|[\\s,;:|/()\\[\\]{}.])`, "i");
      if (regex.test(lower)) {
        found.add(skill);
        break;
      }
    }
  }

  return Array.from(found);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectDomain(text: string): { domain: string; confidence: number } {
  const lower = text.toLowerCase();
  const skills = extractSkillsFromText(lower);
  const scores: Record<string, number> = {};

  for (const [domain, domainSkills] of Object.entries(DOMAIN_SKILLS)) {
    let matchCount = 0;
    for (const ds of domainSkills) {
      if (skills.includes(ds)) matchCount++;
    }
    scores[domain] = matchCount / domainSkills.length;
  }

  let bestDomain = "general";
  let bestScore = 0;
  for (const [domain, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return { domain: bestDomain, confidence: Math.round(bestScore * 100) / 100 };
}

export function analyzeTextStructure(text: string): {
  sections: string[];
  hasBulletPoints: boolean;
  hasActionVerbs: boolean;
  sectionCount: number;
  bulletCount: number;
  actionVerbCount: number;
  wordCount: number;
  lineCount: number;
} {
  const lines = text.split("\n").map((l) => l.trim());
  const sectionHeaders = [
    "experience", "education", "skills", "projects", "summary",
    "objective", "certifications", "achievements", "awards",
    "publications", "languages", "interests", "profile",
    "contact", "work experience", "professional experience",
    "employment", "academic", "training", "internships",
  ];

  const foundSections: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase().replace(/[:\-—]/g, "").trim();
    if (sectionHeaders.includes(lower) && lower.length > 2) {
      foundSections.push(lower);
    }
  }

  const bulletLines = lines.filter((l) => /^[•·▪◦\-*≥]/.test(l) || /^\d+[.)]/.test(l));
  const hasBullets = bulletLines.length > 0;

  const words = tokenize(text);
  let actionVerbCount = 0;
  for (const w of words) {
    if (ACTION_VERBS.has(w)) actionVerbCount++;
  }

  return {
    sections: foundSections,
    hasBulletPoints: hasBullets,
    hasActionVerbs: actionVerbCount > 3,
    sectionCount: foundSections.length,
    bulletCount: bulletLines.length,
    actionVerbCount,
    wordCount: words.length,
    lineCount: lines.length,
  };
}

export function detectIndianContext(text: string): {
  isIndian: boolean;
  signals: string[];
} {
  const lower = text.toLowerCase();
  const signals: string[] = [];

  if (/\b(?:india|indian|delhi|mumbai|bangalore|bengaluru|chennai|hyderabad|pune|kolkata|ahmedabad|jaipur|surat|lucknow|kanpur|nagpur|indore|bhopal|patna|vizag|coimbatore|kochi)\b/i.test(text)) {
    signals.push("location");
  }
  if (/\+91|91[\s-]?\d{10}/.test(text)) signals.push("phone");
  if (/\b(?:b\.?tech|m\.?tech|b\.?e|m\.?ca|b\.?sc|m\.?sc|b\.?com|m\.?com|mba|bca)\b/i.test(text)) {
    signals.push("education");
  }
  if (/\b(?:iit|nit|iiit|bits|vit|srm|amrita|jntu|anna university|delhi university|mumbai university)\b/i.test(text)) {
    signals.push("institute");
  }
  if (/\b(?:cgpa|sgpa|percentage|aggregate)\b/i.test(text) || /\d{1,2}\.\d{1,2}\s*(?:cgpa|sgpa)/i.test(text)) {
    signals.push("grading");
  }
  if (/\b(?:tcs|infosys|wipro|hcl|tech mahindra|cognizant|accenture|capgemini)\b/i.test(text)) {
    signals.push("company");
  }
  if (/\b(?:rupees|rs\.?|inr|₹)\b/i.test(text)) signals.push("currency");
  if (/\b(?:ssc|hsc|cbse|icse|state board)\b/i.test(text)) signals.push("board");

  return {
    isIndian: signals.length >= 2,
    signals,
  };
}

export function detectFormalLetterMarker(text: string): boolean {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const first5 = lines.slice(0, 5).join(" ").toLowerCase();
  return /\b(?:dear|respected|sir|madam|sir\/madam|hiring manager|to whom it may concern|subject:|regarding)\b/.test(first5);
}
