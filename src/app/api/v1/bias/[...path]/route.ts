import { NextRequest, NextResponse } from "next/server";
import { authenticateToken } from "@/lib/auth-service";
import { extractToken } from "@/lib/jwt";
import { blindScore, compareBias } from "@/lib/bias";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const pathParts = req.nextUrl.pathname.split("/").filter(Boolean);
  const last = pathParts[pathParts.length - 1];

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const jobDescription = (formData.get("job_description") as string) || undefined;
    if (!file) return NextResponse.json({ detail: "No file uploaded" }, { status: 422 });

    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (!["pdf", "docx"].includes(ext)) {
      return NextResponse.json({ detail: "Only PDF and DOCX files are supported." }, { status: 422 });
    }

    if (last === "blind-score") {
      const result = await blindScore(file, jobDescription);
      return NextResponse.json(result);
    }

    if (last === "compare") {
      const result = await compareBias(file, jobDescription);
      return NextResponse.json(result);
    }

    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ detail: `Bias analysis failed: ${(e as Error).message}` }, { status: 500 });
  }
}
