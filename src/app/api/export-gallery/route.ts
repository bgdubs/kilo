export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { containers, items, sets } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const containerId = searchParams.get("containerId");

    let allContainers;
    if (containerId) {
      allContainers = await db
        .select()
        .from(containers)
        .where(eq(containers.id, parseInt(containerId)));
    } else {
      allContainers = await db.select().from(containers);
    }

    let allItems;
    if (containerId) {
      allItems = await db
        .select()
        .from(items)
        .where(eq(items.containerId, parseInt(containerId)));
    } else {
      allItems = await db.select().from(items);
    }

    const allSets = await db.select().from(sets);

    const html = buildGalleryHTML(allContainers, allItems, allSets);

    return new NextResponse(html, {
      headers: {
        "Content-Disposition": `attachment; filename="inventory-gallery-${Date.now()}.html"`,
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Failed to export gallery:", error);
    return NextResponse.json(
      { error: "Failed to export gallery" },
      { status: 500 }
    );
  }
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildContainerSection(
  c: {
    id: number;
    name: string;
    description: string | null;
    imageData: string;
    category: string | null;
    createdAt: Date | null;
  },
  allItems: Array<{
    id: number;
    containerId: number | null;
    name: string;
    description: string | null;
    imageData: string;
    category: string | null;
    quantity: number;
    createdAt: Date | null;
  }>
): string {
  const cItems = allItems.filter((i) => i.containerId === c.id);
  const itemCards = cItems
    .map(
      (i) => `<div class="card">
          <img src="${esc(i.imageData)}" alt="${esc(i.name)}">
          <div class="info">
            <h3>${esc(i.name)}</h3>
            ${i.quantity > 1 ? `<span class="badge qty">Qty: ${i.quantity}</span>` : ""}
            ${i.category ? `<span class="badge">${esc(i.category)}</span>` : ""}
            ${i.description ? `<p class="desc">${esc(i.description)}</p>` : ""}
          </div>
        </div>`
    )
    .join("\n");

  return `<details class="container-section">
        <summary class="container-header">
          <img src="${esc(c.imageData)}" alt="${esc(c.name)}">
          <div>
            <h2>${esc(c.name)}</h2>
            ${c.category ? `<span class="badge">${esc(c.category)}</span>` : ""}
            ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ""}
            <p class="meta">${cItems.length} item${cItems.length !== 1 ? "s" : ""}</p>
          </div>
          <span class="chevron"></span>
        </summary>
        ${cItems.length === 0 ? '<p class="empty">No items in this container.</p>' : `<div class="grid">${itemCards}</div>`}
      </details>`;
}

function buildGalleryHTML(
  allContainers: Array<{
    id: number;
    name: string;
    description: string | null;
    imageData: string;
    category: string | null;
    setId: number | null;
    createdAt: Date | null;
  }>,
  allItems: Array<{
    id: number;
    containerId: number | null;
    setId: number | null;
    name: string;
    description: string | null;
    imageData: string;
    category: string | null;
    quantity: number;
    createdAt: Date | null;
  }>,
  allSets: Array<{
    id: number;
    name: string;
    description: string | null;
  }>
): string {
  // Group containers by set
  const setMap = new Map<number, typeof allSets[0]>();
  for (const s of allSets) {
    setMap.set(s.id, s);
  }

  const containersBySet = new Map<number | null, typeof allContainers>();
  for (const c of allContainers) {
    const key = c.setId;
    if (!containersBySet.has(key)) {
      containersBySet.set(key, []);
    }
    containersBySet.get(key)!.push(c);
  }

  // Build set sections
  const setSections: string[] = [];

  // Named sets first
  for (const s of allSets) {
    const setContainers = containersBySet.get(s.id) ?? [];
    const standaloneItems = allItems.filter((i) => i.setId === s.id && i.containerId === null);
    if (setContainers.length === 0 && standaloneItems.length === 0) continue;

    const containerHTML = setContainers
      .map((c) => buildContainerSection(c, allItems))
      .join("\n");

    const standaloneHTML = standaloneItems.length > 0
      ? `<div class="standalone-section">
          <h3 class="standalone-heading">Standalone Items</h3>
          <div class="grid">${standaloneItems.map((i) => `<div class="card">
            <img src="${esc(i.imageData)}" alt="${esc(i.name)}">
            <div class="info">
              <h3>${esc(i.name)}</h3>
              ${i.quantity > 1 ? `<span class="badge qty">Qty: ${i.quantity}</span>` : ""}
              ${i.category ? `<span class="badge">${esc(i.category)}</span>` : ""}
              ${i.description ? `<p class="desc">${esc(i.description)}</p>` : ""}
            </div>
          </div>`).join("\n")}</div>
        </div>`
      : "";

    const metaParts = [];
    if (setContainers.length > 0) metaParts.push(`${setContainers.length} container${setContainers.length !== 1 ? "s" : ""}`);
    if (standaloneItems.length > 0) metaParts.push(`${standaloneItems.length} standalone item${standaloneItems.length !== 1 ? "s" : ""}`);

    setSections.push(`<details class="set-section" open>
        <summary class="set-header">
          <div>
            <h2>${esc(s.name)}</h2>
            ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ""}
            <p class="meta">${metaParts.join(", ")}</p>
          </div>
          <span class="chevron"></span>
        </summary>
        <div class="set-contents">
          ${containerHTML}
          ${standaloneHTML}
        </div>
      </details>`);
  }

  // Unassigned containers and root standalone items
  const unassigned = containersBySet.get(null) ?? [];
  const rootStandaloneItems = allItems.filter((i) => i.containerId === null && i.setId === null);
  if (unassigned.length > 0 || rootStandaloneItems.length > 0) {
    const containerHTML = unassigned
      .map((c) => buildContainerSection(c, allItems))
      .join("\n");

    const standaloneHTML = rootStandaloneItems.length > 0
      ? `<div class="standalone-section">
          <h3 class="standalone-heading">Standalone Items</h3>
          <div class="grid">${rootStandaloneItems.map((i) => `<div class="card">
            <img src="${esc(i.imageData)}" alt="${esc(i.name)}">
            <div class="info">
              <h3>${esc(i.name)}</h3>
              ${i.quantity > 1 ? `<span class="badge qty">Qty: ${i.quantity}</span>` : ""}
              ${i.category ? `<span class="badge">${esc(i.category)}</span>` : ""}
              ${i.description ? `<p class="desc">${esc(i.description)}</p>` : ""}
            </div>
          </div>`).join("\n")}</div>
        </div>`
      : "";

    const metaParts = [];
    if (unassigned.length > 0) metaParts.push(`${unassigned.length} container${unassigned.length !== 1 ? "s" : ""}`);
    if (rootStandaloneItems.length > 0) metaParts.push(`${rootStandaloneItems.length} standalone item${rootStandaloneItems.length !== 1 ? "s" : ""}`);

    setSections.push(`<details class="set-section" open>
        <summary class="set-header">
          <div>
            <h2>Unassigned</h2>
            <p class="meta">${metaParts.join(", ")}</p>
          </div>
          <span class="chevron"></span>
        </summary>
        <div class="set-contents">
          ${containerHTML}
          ${standaloneHTML}
        </div>
      </details>`);
  }

  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const setCount = allSets.filter((s) => {
    const hasContainers = containersBySet.has(s.id) && containersBySet.get(s.id)!.length > 0;
    const hasStandalone = allItems.some((i) => i.setId === s.id && i.containerId === null);
    return hasContainers || hasStandalone;
  }).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photo Inventory - ${date}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 1.8rem; margin-bottom: 4px; }
  .subtitle { color: #888; margin-bottom: 24px; font-size: 0.9rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .card { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.1); transition: box-shadow 0.2s; }
  .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .card img { width: 100%; height: 180px; object-fit: cover; display: block; }
  .info { padding: 12px; }
  .info h3 { font-size: 1rem; margin-bottom: 6px; }
  .badge { display: inline-block; background: #e8f0fe; color: #1a73e8; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; margin-right: 4px; margin-bottom: 4px; }
  .badge.qty { background: #e6f4ea; color: #1e8e3e; }
  .desc { font-size: 0.85rem; color: #666; margin: 6px 0; }
  .meta { font-size: 0.8rem; color: #999; }
  .set-section { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 12px; overflow: hidden; }
  .set-header { display: flex; gap: 16px; padding: 16px; align-items: center; cursor: pointer; list-style: none; background: #f0f0f0; }
  .set-header::-webkit-details-marker { display: none; }
  .set-header h2 { font-size: 1.3rem; margin-bottom: 4px; }
  .set-contents { padding: 12px; }
  .container-section { margin-bottom: 12px; background: #fff; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); overflow: hidden; }
  .container-header { display: flex; gap: 16px; padding: 12px; align-items: center; cursor: pointer; list-style: none; }
  .container-header::-webkit-details-marker { display: none; }
  .container-header img { width: 80px; height: 60px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
  .container-header h2 { font-size: 1.1rem; margin-bottom: 4px; }
  .chevron { margin-left: auto; flex-shrink: 0; width: 20px; height: 20px; border-right: 2.5px solid #999; border-bottom: 2.5px solid #999; transform: rotate(-45deg); transition: transform 0.2s; }
  .set-section[open] > .set-header .chevron { transform: rotate(45deg); }
  .container-section[open] > .container-header .chevron { transform: rotate(45deg); }
  .container-section > .grid, .container-section > .empty { padding: 0 12px 16px; }
  .empty { color: #999; text-align: center; padding: 40px; }
  .standalone-section { margin-top: 12px; }
  .standalone-heading { font-size: 1rem; font-weight: 600; color: #555; margin-bottom: 10px; padding: 8px 12px; background: #f8f8f8; border-radius: 8px; }
  @media (max-width: 600px) {
    .grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .card img { height: 140px; }
    .container-header img { width: 60px; height: 45px; }
  }
</style>
</head>
<body>
  <h1>Photo Inventory</h1>
  <p class="subtitle">Exported ${date} &middot; ${setCount} set${setCount !== 1 ? "s" : ""}, ${allContainers.length} container${allContainers.length !== 1 ? "s" : ""}, ${allItems.length} item${allItems.length !== 1 ? "s" : ""}</p>

  ${allContainers.length === 0 ? '<p class="empty">No containers.</p>' : setSections.join("\n")}
</body>
</html>`;
}
