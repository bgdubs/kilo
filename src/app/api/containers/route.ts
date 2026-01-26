import { NextResponse } from "next/server";
import { db } from "@/db";
import { containers } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const allContainers = await db.select().from(containers);
    return NextResponse.json(allContainers);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch containers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, imageData } = await request.json();
    const newContainer = await db.insert(containers).values({ name, imageData }).returning();
    return NextResponse.json(newContainer[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create container" }, { status: 500 });
  }
}