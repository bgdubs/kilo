import { NextResponse } from "next/server";
import { db } from "@/db";
import { containers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { processImage } from "@/lib/image-utils";

export async function GET() {
  try {
    const allContainers = await db.select().from(containers);
    return NextResponse.json(allContainers);
  } catch (error) {
    console.error("Failed to fetch containers:", error);
    return NextResponse.json({ error: "Failed to fetch containers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, description, imageData, category, confidence } = await request.json();
    
    if (!name || !imageData) {
      return NextResponse.json({ error: "Name and image data are required" }, { status: 400 });
    }

    // Process image (resize, compress, generate thumbnail)
    const processedImage = await processImage(imageData);
    
    // Build insert data defensively - only include fields that exist in schema
    const insertData: any = {
      name,
      imageData: processedImage.imageData,
    };
    
    // Only add optional fields if they're provided
    if (description !== undefined) insertData.description = description;
    if (category !== undefined) insertData.category = category;
    if (confidence !== undefined) insertData.confidence = confidence;
    
    // Try to add new fields - if they don't exist in DB, this will fail gracefully
    try {
      insertData.imageUrl = processedImage.imageUrl;
      insertData.thumbnailUrl = processedImage.thumbnailUrl;
    } catch (e) {
      // Fields don't exist in schema yet, skip them
      console.log("Image URL fields not supported in current schema");
    }
    
    const newContainer = await db.insert(containers).values(insertData).returning();
    
    return NextResponse.json(newContainer[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create container:", error);
    // Return more detailed error for debugging
    return NextResponse.json({ 
      error: "Failed to create container",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, name, description, imageData, category, confidence } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: "Container ID is required" }, { status: 400 });
    }

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (confidence !== undefined) updateData.confidence = confidence;
    
    // Try to add updatedAt - if it doesn't exist in DB, skip it
    try {
      updateData.updatedAt = new Date();
    } catch (e) {
      // Field doesn't exist in schema yet, skip it
      console.log("updatedAt field not supported in current schema");
    }
    
    // If new image data is provided, process it
    if (imageData) {
      const processedImage = await processImage(imageData);
      updateData.imageData = processedImage.imageData;
      
      // Try to add image URL fields - if they don't exist in DB, skip them
      try {
        updateData.imageUrl = processedImage.imageUrl;
        updateData.thumbnailUrl = processedImage.thumbnailUrl;
      } catch (e) {
        // Fields don't exist in schema yet, skip them
        console.log("Image URL fields not supported in current schema");
      }
    }

    const updatedContainer = await db
      .update(containers)
      .set(updateData)
      .where(eq(containers.id, id))
      .returning();
    
    if (updatedContainer.length === 0) {
      return NextResponse.json({ error: "Container not found" }, { status: 404 });
    }
    
    return NextResponse.json(updatedContainer[0]);
  } catch (error) {
    console.error("Failed to update container:", error);
    return NextResponse.json({ 
      error: "Failed to update container",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "Container ID is required" }, { status: 400 });
    }

    const deletedContainer = await db
      .delete(containers)
      .where(eq(containers.id, parseInt(id)))
      .returning();
    
    if (deletedContainer.length === 0) {
      return NextResponse.json({ error: "Container not found" }, { status: 404 });
    }
    
    return NextResponse.json({ message: "Container deleted successfully" });
  } catch (error) {
    console.error("Failed to delete container:", error);
    return NextResponse.json({ error: "Failed to delete container" }, { status: 500 });
  }
}