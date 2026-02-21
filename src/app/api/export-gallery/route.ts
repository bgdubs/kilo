import { NextResponse } from "next/server";
import { db } from "@/db";
import { containers, items } from "@/db/schema";
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

    const html = buildGalleryHTML(allContainers, allItems);

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

function buildGalleryHTML(
  allContainers: Array<{
    id: number;
    name: string;
    description: string | null;
    imageData: string;
    category: string | null;
    createdAt: Date | null;
  }>,
  allItems: Array<{
    id: number;
    containerId: number;
    name: string;
    description: string | null;
    imageData: string;
    category: string | null;
    quantity: number;
    createdAt: Date | null;
  }>
): string {
  const containerCards = allContainers
    .map((c) => {
      const itemCount = allItems.filter((i) => i.containerId === c.id).length;
      return `<div class="card" onclick="showContainer(${c.id})">
        <img src="${esc(c.imageData)}" alt="${esc(c.name)}">
        <div class="info">
          <h3>${esc(c.name)}</h3>
          ${c.category ? `<span class="badge">${esc(c.category)}</span>` : ""}
          ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ""}
          <p class="meta">${itemCount} item${itemCount !== 1 ? "s" : ""}</p>
        </div>
      </div>`;
    })
    .join("\n");

  const containerSections = allContainers
    .map((c) => {
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

      return `<div id="container-${c.id}" class="container-view" style="display:none">
        <button class="back" onclick="showGrid()">&larr; Back to Containers</button>
        <div class="container-header">
          <img src="${esc(c.imageData)}" alt="${esc(c.name)}">
          <div>
            <h2>${esc(c.name)}</h2>
            ${c.category ? `<span class="badge">${esc(c.category)}</span>` : ""}
            ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ""}
            <p class="meta">${cItems.length} item${cItems.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        ${cItems.length === 0 ? '<p class="empty">No items in this container.</p>' : `<div class="grid">${itemCards}</div>`}
      </div>`;
    })
    .join("\n");

  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
  .card { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.1); cursor: pointer; transition: box-shadow 0.2s; }
  .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .card img { width: 100%; height: 180px; object-fit: cover; display: block; }
  .info { padding: 12px; }
  .info h3 { font-size: 1rem; margin-bottom: 6px; }
  .badge { display: inline-block; background: #e8f0fe; color: #1a73e8; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; margin-right: 4px; margin-bottom: 4px; }
  .badge.qty { background: #e6f4ea; color: #1e8e3e; }
  .desc { font-size: 0.85rem; color: #666; margin: 6px 0; }
  .meta { font-size: 0.8rem; color: #999; }
  .back { background: none; border: none; color: #1a73e8; font-size: 1rem; cursor: pointer; padding: 8px 0; margin-bottom: 16px; }
  .back:hover { text-decoration: underline; }
  .container-header { display: flex; gap: 16px; margin-bottom: 20px; align-items: flex-start; }
  .container-header img { width: 160px; height: 120px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
  .container-header h2 { font-size: 1.4rem; margin-bottom: 6px; }
  .container-view .card { cursor: default; }
  .empty { color: #999; text-align: center; padding: 40px; }
  @media (max-width: 600px) {
    .grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .card img { height: 140px; }
    .container-header { flex-direction: column; }
    .container-header img { width: 100%; height: 200px; }
  }
</style>
</head>
<body>
  <h1>Photo Inventory</h1>
  <p class="subtitle">Exported ${date} &middot; ${allContainers.length} container${allContainers.length !== 1 ? "s" : ""}, ${allItems.length} item${allItems.length !== 1 ? "s" : ""}</p>

  <div id="grid-view">
    ${allContainers.length === 0 ? '<p class="empty">No containers.</p>' : `<div class="grid">${containerCards}</div>`}
  </div>

  ${containerSections}

  <script>
    function showContainer(id) {
      document.getElementById('grid-view').style.display = 'none';
      document.querySelectorAll('.container-view').forEach(el => el.style.display = 'none');
      document.getElementById('container-' + id).style.display = 'block';
      window.scrollTo(0, 0);
    }
    function showGrid() {
      document.querySelectorAll('.container-view').forEach(el => el.style.display = 'none');
      document.getElementById('grid-view').style.display = 'block';
      window.scrollTo(0, 0);
    }
  </script>
</body>
</html>`;
}
