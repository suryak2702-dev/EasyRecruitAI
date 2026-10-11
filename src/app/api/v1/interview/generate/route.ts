import { NextRequest, NextResponse } from "next/server";
import { authenticateToken } from "@/lib/auth-service";
import { extractToken } from "@/lib/jwt";
import { generateInterviewQuestions } from "@/lib/interview";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const jobDescription = (formData.get("job_description") as string) || undefined;
    const maxQuestions = parseInt((formData.get("max_questions") as string) || "20", 10);
    if (!file) return NextResponse.json({ detail: "No file uploaded" }, { status: 422 });

    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (!["pdf", "docx"].includes(ext)) {
      return NextResponse.json({ detail: "Only PDF and DOCX files are supported." }, { status: 422 });
    }

    const result = await generateInterviewQuestions(file, jobDescription, maxQuestions);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ detail: `Failed: ${(e as Error).message}` }, { status: 500 });
  }
}
