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
    
    const newContainer = await db.insert(containers).values({
      name,
      description: description || null,
      imageData: processedImage.imageData,
      imageUrl: processedImage.imageUrl,
      thumbnailUrl: processedImage.thumbnailUrl,
      category: category || null,
      confidence: confidence || null,
    }).returning();
    
    return NextResponse.json(newContainer[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create container:", error);
    return NextResponse.json({ error: "Failed to create container" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, name, description, imageData, category, confidence } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: "Container ID is required" }, { status: 400 });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (confidence !== undefined) updateData.confidence = confidence;
    
    // If new image data is provided, process it
    if (imageData) {
      const processedImage = await processImage(imageData);
      updateData.imageData = processedImage.imageData;
      updateData.imageUrl = processedImage.imageUrl;
      updateData.thumbnailUrl = processedImage.thumbnailUrl;
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