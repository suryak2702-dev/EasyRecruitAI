import { NextRequest, NextResponse } from "next/server";
import { authenticateToken } from "@/lib/auth-service";
import { extractToken } from "@/lib/jwt";
import { detectFraud } from "@/lib/fraud";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  const user = token ? await authenticateToken(token) : null;
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ detail: "No file uploaded" }, { status: 422 });

    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (!["pdf", "docx"].includes(ext)) {
      return NextResponse.json({ detail: "Only PDF and DOCX files are supported." }, { status: 422 });
    }

    const result = await detectFraud(file);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ detail: `Fraud detection failed: ${(e as Error).message}` }, { status: 500 });
  }
}
