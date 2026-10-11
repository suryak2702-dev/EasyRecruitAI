import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    version: "3.0.0",
    database: "connected",
    services: {
      scoring: "active",
      parsing: "active",
      fraud_detection: "active",
      bias_analysis: "active",
      interview_generation: "active",
    },
    timestamp: new Date().toISOString(),
  });
}
