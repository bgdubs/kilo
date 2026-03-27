export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { containers, items } from "@/db/schema";
import { eq, desc, isNull, and } from "drizzle-orm";
import { processImage } from "@/lib/image-utils";

/** Walk up the container tree to detect cycles. Returns true if `ancestorId` is an ancestor of `nodeId`. */
async function isAncestor(nodeId: number, ancestorId: number): Promise<boolean> {
  let current: number | null = nodeId;
  const visited = new Set<number>();
  while (current !== null) {
    if (current === ancestorId) return true;
    if (visited.has(current)) break; // cycle already present
    visited.add(current);
    const row = await db.select({ parentContainerId: containers.parentContainerId })
      .from(containers).where(eq(containers.id, current));
    current = row[0]?.parentContainerId ?? null;
  }
  return false;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const setIdParam = searchParams.get("setId");
    const parentContainerIdParam = searchParams.get("parentContainerId");

    // Containers nested inside a specific container
    if (parentContainerIdParam) {
      const result = await db.select().from(containers)
        .where(eq(containers.parentContainerId, parseInt(parentContainerIdParam)))
        .orderBy(desc(containers.createdAt));
      return NextResponse.json(result);
    }

    // Containers at root level of a set (or root of app)
    if (setIdParam === "null") {
      const result = await db.select().from(containers)
        .where(and(isNull(containers.setId), isNull(containers.parentContainerId)))
        .orderBy(desc(containers.createdAt));
      return NextResponse.json(result);
    }
    if (setIdParam) {
      const result = await db.select().from(containers)
        .where(and(eq(containers.setId, parseInt(setIdParam)), isNull(containers.parentContainerId)))
        .orderBy(desc(containers.createdAt));
      return NextResponse.json(result);
    }

    // All containers
    const result = await db.select().from(containers).orderBy(desc(containers.createdAt));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch containers:", error);
    return NextResponse.json({ error: "Failed to fetch containers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, imageData, description, category, setId, parentContainerId } = await request.json();

    if (!name || !imageData) {
      return NextResponse.json({ error: "Name and image data are required" }, { status: 400 });
    }
    if (setId && parentContainerId) {
      return NextResponse.json({ error: "Container cannot have both setId and parentContainerId" }, { status: 400 });
    }

    const processedImage = await processImage(imageData);

    const newContainer = await db.insert(containers).values({
      name,
      imageData: processedImage.imageData,
      description: description || null,
      category: category || null,
      setId: setId || null,
      parentContainerId: parentContainerId || null,
    }).returning();

    return NextResponse.json(newContainer[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create container:", error);
    return NextResponse.json({ error: "Failed to create container" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, name, imageData, description, category, confidence, setId, parentContainerId } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Container ID is required" }, { status: 400 });
    }
    if (setId != null && parentContainerId != null) {
      return NextResponse.json({ error: "Container cannot have both setId and parentContainerId" }, { status: 400 });
    }

    // Cycle detection: cannot move a container into its own descendant
    if (parentContainerId != null) {
      const wouldCycle = await isAncestor(parentContainerId, id);
      if (wouldCycle) {
        return NextResponse.json({ error: "Cannot move a container into its own descendant" }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (confidence !== undefined) updateData.confidence = confidence;
    // Accept explicit null to clear parent
    if (setId !== undefined) updateData.setId = setId;
    if (parentContainerId !== undefined) updateData.parentContainerId = parentContainerId;

    if (imageData) {
      const processedImage = await processImage(imageData);
      updateData.imageData = processedImage.imageData;
    }

    const updatedContainer = await db.update(containers).set(updateData).where(eq(containers.id, id)).returning();

    if (updatedContainer.length === 0) {
      return NextResponse.json({ error: "Container not found" }, { status: 404 });
    }

    return NextResponse.json(updatedContainer[0]);
  } catch (error) {
    console.error("Failed to update container:", error);
    return NextResponse.json({ error: "Failed to update container" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Container ID is required" }, { status: 400 });
    }

    const containerId = parseInt(id);

    // Delete all items in this container
    await db.delete(items).where(eq(items.containerId, containerId));

    // Move nested containers to root (avoid orphaning them)
    await db.update(containers)
      .set({ parentContainerId: null })
      .where(eq(containers.parentContainerId, containerId));

    const deletedContainer = await db.delete(containers).where(eq(containers.id, containerId)).returning();

    if (deletedContainer.length === 0) {
      return NextResponse.json({ error: "Container not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Container deleted successfully" });
  } catch (error) {
    console.error("Failed to delete container:", error);
    return NextResponse.json({ error: "Failed to delete container" }, { status: 500 });
  }
}
