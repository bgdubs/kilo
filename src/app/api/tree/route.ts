export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { sets, containers } from "@/db/schema";

export type TreeNode = {
  id: number;
  type: "set" | "container";
  name: string;
  depth: number;
  parentId: number | null;
  parentType: "set" | "container" | null;
};

function buildTree(
  allSets: Array<{ id: number; name: string; parentId: number | null }>,
  allContainers: Array<{ id: number; name: string; setId: number | null; parentContainerId: number | null }>
): TreeNode[] {
  const result: TreeNode[] = [];

  function addSet(setId: number | null, depth: number) {
    const children = allSets.filter(s => s.parentId === setId);
    for (const s of children) {
      result.push({ id: s.id, type: "set", name: s.name, depth, parentId: setId, parentType: setId ? "set" : null });
      // Containers directly in this set (no parentContainerId)
      const setContainers = allContainers.filter(c => c.setId === s.id && c.parentContainerId === null);
      for (const c of setContainers) {
        result.push({ id: c.id, type: "container", name: c.name, depth: depth + 1, parentId: s.id, parentType: "set" });
        addNestedContainers(c.id, depth + 2);
      }
      addSet(s.id, depth + 1);
    }
  }

  function addNestedContainers(parentContainerId: number, depth: number) {
    const children = allContainers.filter(c => c.parentContainerId === parentContainerId);
    for (const c of children) {
      result.push({ id: c.id, type: "container", name: c.name, depth, parentId: parentContainerId, parentType: "container" });
      addNestedContainers(c.id, depth + 1);
    }
  }

  // Root sets and their containers
  addSet(null, 0);

  // Root containers (no set, no parent container)
  const rootContainers = allContainers.filter(c => c.setId === null && c.parentContainerId === null);
  for (const c of rootContainers) {
    result.push({ id: c.id, type: "container", name: c.name, depth: 0, parentId: null, parentType: null });
    addNestedContainers(c.id, 1);
  }

  return result;
}

export async function GET() {
  try {
    const allSets = await db.select({ id: sets.id, name: sets.name, parentId: sets.parentId }).from(sets);
    const allContainers = await db.select({
      id: containers.id,
      name: containers.name,
      setId: containers.setId,
      parentContainerId: containers.parentContainerId,
    }).from(containers);

    const tree = buildTree(allSets, allContainers);
    return NextResponse.json(tree);
  } catch (error) {
    console.error("Failed to build tree:", error);
    return NextResponse.json({ error: "Failed to build tree" }, { status: 500 });
  }
}
