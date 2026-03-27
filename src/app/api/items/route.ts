export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, isNull, desc, and } from "drizzle-orm";
import { processImage } from "@/lib/image-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const containerId = searchParams.get("containerId");
  const setIdParam = searchParams.get("setId");

  try {
    // Items inside a specific container
    if (containerId) {
      const result = await db.select().from(items)
        .where(eq(items.containerId, parseInt(containerId)))
        .orderBy(desc(items.createdAt));
      return NextResponse.json(result);
    }

    // Standalone items in a specific set
    if (setIdParam === "null") {
      const result = await db.select().from(items)
        .where(and(isNull(items.containerId), isNull(items.setId)))
        .orderBy(desc(items.createdAt));
      return NextResponse.json(result);
    }
    if (setIdParam) {
      const result = await db.select().from(items)
        .where(and(isNull(items.containerId), eq(items.setId, parseInt(setIdParam))))
        .orderBy(desc(items.createdAt));
      return NextResponse.json(result);
    }

    // All items
    const allItems = await db.select().from(items).orderBy(desc(items.createdAt));
    return NextResponse.json(allItems);
  } catch (error) {
    console.error("Failed to fetch items:", error);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { containerId, setId, name, imageData, quantity, description, category } = await request.json();

    if (!name || !imageData) {
      return NextResponse.json({ error: "Name and image data are required" }, { status: 400 });
    }
    if (containerId && setId) {
      return NextResponse.json({ error: "Item cannot have both containerId and setId" }, { status: 400 });
    }

    const processedImage = await processImage(imageData);

    const newItem = await db.insert(items).values({
      containerId: containerId || null,
      setId: setId || null,
      name,
      imageData: processedImage.imageData,
      quantity: quantity || 1,
      description: description || null,
      category: category || null,
    }).returning();

    return NextResponse.json(newItem[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create item:", error);
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, name, imageData, quantity, description, category, confidence, containerId, setId } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }
    if (containerId && setId) {
      return NextResponse.json({ error: "Item cannot have both containerId and setId" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (confidence !== undefined) updateData.confidence = confidence;

    // Move semantics: accept explicit null to clear a parent
    if (containerId !== undefined) updateData.containerId = containerId;
    if (setId !== undefined) updateData.setId = setId;

    if (imageData) {
      const processedImage = await processImage(imageData);
      updateData.imageData = processedImage.imageData;
    }

    const updatedItem = await db.update(items).set(updateData).where(eq(items.id, id)).returning();

    if (updatedItem.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json(updatedItem[0]);
  } catch (error) {
    console.error("Failed to update item:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const deletedItem = await db.delete(items).where(eq(items.id, parseInt(id))).returning();

    if (deletedItem.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Failed to delete item:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
