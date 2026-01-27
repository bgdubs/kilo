import { NextResponse } from "next/server";
import { db } from "@/db";
import { containers } from "@/db/schema";

export async function GET() {
  try {
    // Try to query database to verify connection
    const result = await db.select().from(containers).limit(1);
    
    return NextResponse.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({
      status: "error",
      database: "disconnected",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
