import { NextResponse } from "next/server";

interface RecognitionResult {
  name: string;
  confidence: number;
  category: string;
  description?: string;
}

const ITEM_RECOGNITIONS: Record<string, RecognitionResult> = {
  "apple": { name: "Apple", confidence: 0.95, category: "Food", description: "Fresh red apple" },
  "banana": { name: "Banana", confidence: 0.92, category: "Food", description: "Ripe yellow banana" },
  "book": { name: "Book", confidence: 0.88, category: "Office Supplies", description: "Hardcover book" },
  "laptop": { name: "Laptop Computer", confidence: 0.97, category: "Electronics", description: "Portable laptop computer" },
  "phone": { name: "Smartphone", confidence: 0.93, category: "Electronics", description: "Mobile smartphone" },
  "chair": { name: "Office Chair", confidence: 0.85, category: "Furniture", description: "Ergonomic office chair" },
  "desk": { name: "Desk", confidence: 0.90, category: "Furniture", description: "Wooden desk" },
  "pen": { name: "Pen", confidence: 0.80, category: "Office Supplies", description: "Ballpoint pen" },
  "notebook": { name: "Notebook", confidence: 0.87, category: "Office Supplies", description: "Spiral notebook" },
  "keyboard": { name: "Keyboard", confidence: 0.94, category: "Electronics", description: "Computer keyboard" },
  "mouse": { name: "Computer Mouse", confidence: 0.91, category: "Electronics", description: "Wireless mouse" },
  "monitor": { name: "Monitor", confidence: 0.96, category: "Electronics", description: "Computer monitor" },
  "headphones": { name: "Headphones", confidence: 0.89, category: "Electronics", description: "Over-ear headphones" },
  "coffee": { name: "Coffee Mug", confidence: 0.86, category: "Kitchen", description: "Ceramic coffee mug" },
  "water": { name: "Water Bottle", confidence: 0.88, category: "Kitchen", description: "Reusable water bottle" },
  "keys": { name: "Keys", confidence: 0.82, category: "Personal", description: "Set of keys" },
  "wallet": { name: "Wallet", confidence: 0.90, category: "Personal", description: "Leather wallet" },
  "sunglasses": { name: "Sunglasses", confidence: 0.84, category: "Accessories", description: "Polarized sunglasses" },
  "watch": { name: "Watch", confidence: 0.92, category: "Accessories", description: "Analog watch" },
  "backpack": { name: "Backpack", confidence: 0.87, category: "Bags", description: "Travel backpack" },
};

const CONTAINER_RECOGNITIONS: Record<string, RecognitionResult> = {
  "box": { name: "Cardboard Box", confidence: 0.92, category: "Storage", description: "Standard cardboard box" },
  "drawer": { name: "Drawer", confidence: 0.88, category: "Furniture", description: "Storage drawer" },
  "shelf": { name: "Shelf", confidence: 0.90, category: "Furniture", description: "Wall-mounted shelf" },
  "cabinet": { name: "Cabinet", confidence: 0.85, category: "Furniture", description: "Storage cabinet" },
  "bin": { name: "Storage Bin", confidence: 0.87, category: "Storage", description: "Plastic storage bin" },
  "crate": { name: "Wooden Crate", confidence: 0.83, category: "Storage", description: "Wooden storage crate" },
  "basket": { name: "Basket", confidence: 0.86, category: "Storage", description: "Woven storage basket" },
  "container": { name: "Storage Container", confidence: 0.89, category: "Storage", description: "Clear storage container" },
  "suitcase": { name: "Suitcase", confidence: 0.91, category: "Travel", description: "Travel suitcase" },
  "bag": { name: "Storage Bag", confidence: 0.84, category: "Storage", description: "Canvas storage bag" },
};

export async function POST(request: Request) {
  try {
    const { imageData, type = "item" } = await request.json();
    
    if (!imageData) {
      return NextResponse.json({ error: "Image data is required" }, { status: 400 });
    }
    
    // Analyze image based on type (container or item)
    const result = analyzeImage(imageData, type);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to recognize image:", error);
    return NextResponse.json({ error: "Failed to recognize image" }, { status: 500 });
  }
}

function analyzeImage(imageData: string, type: string): RecognitionResult {
  // Extract filename or use simple pattern matching
  const filenameMatch = imageData.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1]?.toLowerCase() || "unknown";
  
  // Choose recognition database based on type
  const recognitions = type === "container" ? CONTAINER_RECOGNITIONS : ITEM_RECOGNITIONS;
  const fallbackName = type === "container" ? "Unidentified Container" : "Unidentified Item";
  const fallbackCategory = type === "container" ? "Storage" : "Unknown";
  
  // Try to match common patterns
  for (const [key, result] of Object.entries(recognitions)) {
    if (filename.includes(key)) {
      return result;
    }
  }
  
  // Try to match partial patterns
  for (const [key, result] of Object.entries(recognitions)) {
    if (key.includes(filename) || filename.includes(key.substring(0, 3))) {
      return { ...result, confidence: result.confidence * 0.8 }; // Lower confidence for partial match
    }
  }
  
  // Fallback to generic recognition
  return { 
    name: fallbackName, 
    confidence: 0.50, 
    category: fallbackCategory,
    description: type === "container" ? "Generic storage container" : "Generic item"
  };
}