import { NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const containerId = searchParams.get("containerId");
  
  try {
    if (containerId) {
      const containerItems = await db.select().from(items).where(eq(items.containerId, parseInt(containerId)));
      return NextResponse.json(containerItems);
    }
    
    const allItems = await db.select().from(items);
    return NextResponse.json(allItems);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { containerId, name, imageData } = await request.json();
    const newItem = await db.insert(items).values({ containerId, name, imageData }).returning();
    return NextResponse.json(newItem[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}