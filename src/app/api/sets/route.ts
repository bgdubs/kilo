export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { sets, containers } from "@/db/schema";
import { eq, isNull, desc } from "drizzle-orm";
import { processImage } from "@/lib/image-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");

    let result;
    if (parentId === "null") {
      result = await db.select().from(sets).where(isNull(sets.parentId)).orderBy(desc(sets.createdAt));
    } else if (parentId) {
      result = await db.select().from(sets).where(eq(sets.parentId, parseInt(parentId))).orderBy(desc(sets.createdAt));
    } else {
      result = await db.select().from(sets).orderBy(desc(sets.createdAt));
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch sets:", error);
    return NextResponse.json({
      error: "Failed to fetch sets",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, description, imageData, parentId } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const values: Record<string, unknown> = {
      name,
      description: description || null,
      parentId: parentId || null,
    };

    if (imageData) {
      const processed = await processImage(imageData);
      values.imageData = processed.imageData;
    }

    const newSet = await db.insert(sets).values(values).returning();
    return NextResponse.json(newSet[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create set:", error);
    return NextResponse.json({
      error: "Failed to create set",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, name, description, imageData, parentId } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Set ID is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (parentId !== undefined) updateData.parentId = parentId;

    if (imageData) {
      const processed = await processImage(imageData);
      updateData.imageData = processed.imageData;
    }

    const updated = await db.update(sets).set(updateData).where(eq(sets.id, id)).returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Set not found" }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (error) {
    console.error("Failed to update set:", error);
    return NextResponse.json({
      error: "Failed to update set",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Set ID is required" }, { status: 400 });
    }

    const setId = parseInt(id);

    // Unassign all containers in this set (set_id -> NULL)
    await db.update(containers).set({ setId: null }).where(eq(containers.setId, setId));

    // Promote child sets to root (parent_id -> NULL)
    await db.update(sets).set({ parentId: null }).where(eq(sets.parentId, setId));

    // Delete the set
    const deleted = await db.delete(sets).where(eq(sets.id, setId)).returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Set not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Set deleted successfully" });
  } catch (error) {
    console.error("Failed to delete set:", error);
    return NextResponse.json({ error: "Failed to delete set" }, { status: 500 });
  }
}
