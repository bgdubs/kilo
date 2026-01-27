import { NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { processImage } from "@/lib/image-utils";

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
    console.error("Failed to fetch items:", error);
    return NextResponse.json({ 
      error: "Failed to fetch items",
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { containerId, name, imageData, quantity } = await request.json();
    
    if (!containerId || !name || !imageData) {
      return NextResponse.json({ error: "Container ID, name, and image data are required" }, { status: 400 });
    }

    // Process image (resize, compress, generate thumbnail)
    const processedImage = await processImage(imageData);
    
    // Only use fields that exist in old schema (containerId, name, imageData, quantity)
    const newItem = await db.insert(items).values({
      containerId,
      name,
      imageData: processedImage.imageData,
      quantity: quantity || 1,
    }).returning();
    
    return NextResponse.json(newItem[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create item:", error);
    return NextResponse.json({ 
      error: "Failed to create item",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, name, imageData, quantity } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (quantity !== undefined) updateData.quantity = quantity;
    
    // If new image data is provided, process it
    if (imageData) {
      const processedImage = await processImage(imageData);
      updateData.imageData = processedImage.imageData;
    }

    const updatedItem = await db
      .update(items)
      .set(updateData)
      .where(eq(items.id, id))
      .returning();
    
    if (updatedItem.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    
    return NextResponse.json(updatedItem[0]);
  } catch (error) {
    console.error("Failed to update item:", error);
    return NextResponse.json({ 
      error: "Failed to update item",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const deletedItem = await db
      .delete(items)
      .where(eq(items.id, parseInt(id)))
      .returning();
    
    if (deletedItem.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    
    return NextResponse.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Failed to delete item:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}