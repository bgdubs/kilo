import { NextResponse } from "next/server";

interface RecognitionResult {
  name: string;
  confidence: number;
  category: string;
}

const MOCK_RECOGNITIONS: Record<string, RecognitionResult> = {
  "apple": { name: "Apple", confidence: 0.95, category: "Fruit" },
  "banana": { name: "Banana", confidence: 0.92, category: "Fruit" },
  "book": { name: "Book", confidence: 0.88, category: "Office Supplies" },
  "laptop": { name: "Laptop Computer", confidence: 0.97, category: "Electronics" },
  "phone": { name: "Smartphone", confidence: 0.93, category: "Electronics" },
  "chair": { name: "Office Chair", confidence: 0.85, category: "Furniture" },
  "desk": { name: "Desk", confidence: 0.90, category: "Furniture" },
  "pen": { name: "Pen", confidence: 0.80, category: "Office Supplies" },
  "notebook": { name: "Notebook", confidence: 0.87, category: "Office Supplies" },
  "keyboard": { name: "Keyboard", confidence: 0.94, category: "Electronics" },
};

export async function POST(request: Request) {
  try {
    const { imageData } = await request.json();
    
    // Simple image analysis based on file name or content
    const result = analyzeImage(imageData);
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Failed to recognize item" }, { status: 500 });
  }
}

function analyzeImage(imageData: string): RecognitionResult {
  // Extract filename or use simple pattern matching
  const filenameMatch = imageData.match(/filename="([^"]+)"/);
  const filename = filenameMatch?.[1]?.toLowerCase() || "unknown";
  
  // Try to match common patterns
  for (const [key, result] of Object.entries(MOCK_RECOGNITIONS)) {
    if (filename.includes(key)) {
      return result;
    }
  }
  
  // Fallback to generic recognition
  return { name: "Unidentified Item", confidence: 0.50, category: "Unknown" };
}