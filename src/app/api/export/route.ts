export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { containers, items, sets } from "@/db/schema";
import { eq } from "drizzle-orm";

interface ExportOptions {
  includeImages?: boolean;
  includeDescriptions?: boolean;
  includeCategories?: boolean;
  includeConfidence?: boolean;
  format?: "csv" | "json";
  containerId?: number;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeImages = searchParams.get("includeImages") === "true";
    const includeDescriptions = searchParams.get("includeDescriptions") === "true";
    const includeCategories = searchParams.get("includeCategories") === "true";
    const includeConfidence = searchParams.get("includeConfidence") === "true";
    const format = (searchParams.get("format") as "csv" | "json") || "csv";
    const containerId = searchParams.get("containerId");

    // Fetch all sets and build lookup map
    const allSets = await db.select().from(sets);
    const setMap: Record<number, string> = {};
    for (const s of allSets) {
      setMap[s.id] = s.name;
    }

    // Fetch all containers
    const allContainers = await db.select().from(containers);

    // Fetch items (filtered by containerId if provided)
    let allItems;
    if (containerId) {
      allItems = await db.select().from(items).where(eq(items.containerId, parseInt(containerId)));
    } else {
      allItems = await db.select().from(items);
    }

    // Build export data
    const exportData = allContainers.flatMap((container) => {
      const containerItems = allItems.filter((item) => item.containerId === container.id);
      
      const setName = container.setId ? setMap[container.setId] || "" : "";

      if (containerItems.length === 0) {
        // Container with no items
        return [{
          setName,
          containerId: container.id,
          containerName: container.name,
          containerDescription: container.description || "",
          containerCategory: container.category || "",
          containerConfidence: container.confidence || 0,
          containerCreatedAt: container.createdAt,
          itemId: 0,
          itemName: "",
          itemDescription: "",
          itemCategory: "",
          itemConfidence: 0,
          itemQuantity: 0,
          itemCreatedAt: null,
          imageUrl: includeImages ? container.imageUrl || "" : "",
          thumbnailUrl: includeImages ? container.thumbnailUrl || "" : "",
        }];
      }

      return containerItems.map((item) => ({
        setName,
        containerId: container.id,
        containerName: container.name,
        containerDescription: container.description || "",
        containerCategory: container.category || "",
        containerConfidence: container.confidence || 0,
        containerCreatedAt: container.createdAt,
        itemId: item.id,
        itemName: item.name,
        itemDescription: item.description || "",
        itemCategory: item.category || "",
        itemConfidence: item.confidence || 0,
        itemQuantity: item.quantity,
        itemCreatedAt: item.createdAt,
        imageUrl: includeImages ? item.imageUrl || "" : "",
        thumbnailUrl: includeImages ? item.thumbnailUrl || "" : "",
      }));
    });

    if (format === "json") {
      return NextResponse.json(exportData, {
        headers: {
          "Content-Disposition": `attachment; filename="inventory-${Date.now()}.json"`,
          "Content-Type": "application/json",
        },
      });
    }

    // Generate CSV
    const csv = generateCSV(exportData, {
      includeImages,
      includeDescriptions,
      includeCategories,
      includeConfidence,
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Disposition": `attachment; filename="inventory-${Date.now()}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Failed to export inventory:", error);
    return NextResponse.json({ error: "Failed to export inventory" }, { status: 500 });
  }
}

function generateCSV(data: any[], options: ExportOptions): string {
  if (data.length === 0) {
    return "No data to export";
  }

  // Build headers based on options
  const headers = [
    "Set Name",
    "Container ID",
    "Container Name",
    ...(options.includeDescriptions ? ["Container Description"] : []),
    ...(options.includeCategories ? ["Container Category"] : []),
    ...(options.includeConfidence ? ["Container Confidence"] : []),
    "Container Created At",
    "Item ID",
    "Item Name",
    ...(options.includeDescriptions ? ["Item Description"] : []),
    ...(options.includeCategories ? ["Item Category"] : []),
    ...(options.includeConfidence ? ["Item Confidence"] : []),
    "Item Quantity",
    "Item Created At",
    ...(options.includeImages ? ["Image URL", "Thumbnail URL"] : []),
  ];

  // Build CSV rows
  const rows = data.map((row) => {
    const values = [
      escapeCSV(row.setName),
      row.containerId,
      escapeCSV(row.containerName),
      ...(options.includeDescriptions ? [escapeCSV(row.containerDescription)] : []),
      ...(options.includeCategories ? [escapeCSV(row.containerCategory)] : []),
      ...(options.includeConfidence ? [row.containerConfidence] : []),
      formatDate(row.containerCreatedAt),
      row.itemId,
      escapeCSV(row.itemName),
      ...(options.includeDescriptions ? [escapeCSV(row.itemDescription)] : []),
      ...(options.includeCategories ? [escapeCSV(row.itemCategory)] : []),
      ...(options.includeConfidence ? [row.itemConfidence] : []),
      row.itemQuantity,
      formatDate(row.itemCreatedAt),
      ...(options.includeImages ? [escapeCSV(row.imageUrl), escapeCSV(row.thumbnailUrl)] : []),
    ];
    return values.join(",");
  });

  // Combine headers and rows
  return [headers.join(","), ...rows].join("\n");
}

function escapeCSV(value: string): string {
  if (!value) return "";
  
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  
  return value;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "";
  
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString();
}
