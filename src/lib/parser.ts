import * as pdfParse from "pdf-parse";
import mammoth from "mammoth";

export async function extractTextFromFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return extractTextFromBuffer(buffer, file.name);
}

export async function extractTextFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop() || "";

  if (ext === "pdf") {
    const result = await (pdfParse as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default(buffer);
    return cleanText(result.text);
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value);
  }

  if (ext === "doc") {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value);
  }

  throw new Error("Unsupported file format. Please upload a PDF or DOCX file.");
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
const PHONE_RE = /(?:\+91[\s.-]?)?(?:\d{5}[\s.-]?\d{5}|\d{3}[\s.-]?\d{3}[\s.-]?\d{4}|\d{10})/;
const LINKEDIN_RE = /(?:linkedin\.com\/in\/|linkedin\.com\/pub\/)([A-Za-z0-9_-]+)/i;
const GITHUB_RE = /github\.com\/([A-Za-z0-9_-]+)/i;

export function extractContactInfo(text: string): {
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
} {
  const email = text.match(EMAIL_RE)?.[0] || null;
  const phone = text.match(PHONE_RE)?.[0] || null;
  const linkedin = text.match(LINKEDIN_RE)?.[0] || null;
  const github = text.match(GITHUB_RE)?.[0] || null;

  let name: string | null = null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (line.length >= 2 && line.length <= 60 && /^[A-Z][a-zA-Z.\s-]+$/.test(line) && line.split(/\s+/).length >= 2) {
      name = line.replace(/\s+/g, " ").trim();
      break;
    }
  }

  return { name, email, phone, linkedin, github };
}
