export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { sets, containers, items } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const setId = searchParams.get("setId");

    if (!setId) {
      return NextResponse.json({ error: "setId is required" }, { status: 400 });
    }

    const rootId = parseInt(setId);

    // Collect all set IDs recursively (max 3 levels deep)
    const allSetIds: number[] = [rootId];

    // Level 1: direct children
    const level1 = await db.select({ id: sets.id }).from(sets).where(eq(sets.parentId, rootId));
    const level1Ids = level1.map(s => s.id);
    allSetIds.push(...level1Ids);

    // Level 2: grandchildren
    if (level1Ids.length > 0) {
      const level2 = await db.select({ id: sets.id }).from(sets).where(inArray(sets.parentId, level1Ids));
      const level2Ids = level2.map(s => s.id);
      allSetIds.push(...level2Ids);

      // Level 3: great-grandchildren
      if (level2Ids.length > 0) {
        const level3 = await db.select({ id: sets.id }).from(sets).where(inArray(sets.parentId, level2Ids));
        allSetIds.push(...level3.map(s => s.id));
      }
    }

    // Get all containers in any of these sets
    const setContainers = await db.select({ id: containers.id })
      .from(containers)
      .where(inArray(containers.setId, allSetIds));

    const containerIds = setContainers.map(c => c.id);

    if (containerIds.length === 0) {
      return NextResponse.json([]);
    }

    // Get all items in those containers
    const allItems = await db.select().from(items).where(inArray(items.containerId, containerIds));

    return NextResponse.json(allItems);
  } catch (error) {
    console.error("Failed to fetch set items:", error);
    return NextResponse.json({
      error: "Failed to fetch set items",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
