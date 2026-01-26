/**
 * Image processing utilities for resizing, compression, and thumbnail generation
 */

export interface ProcessedImageResult {
  imageData: string; // Base64 encoded image
  imageUrl: string; // File path/URL
  thumbnailData: string; // Base64 encoded thumbnail
  thumbnailUrl: string; // Thumbnail file path/URL
  width: number;
  height: number;
  size: number;
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
  thumbnailSize?: number; // Square thumbnail size
  thumbnailQuality?: number; // 0-1
}

const DEFAULT_OPTIONS: ImageProcessingOptions = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
  thumbnailSize: 200,
  thumbnailQuality: 0.75,
};

/**
 * Process an image: resize, compress, and generate thumbnail
 */
export async function processImage(
  imageData: string,
  options: ImageProcessingOptions = {}
): Promise<ProcessedImageResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Parse base64 data
  const { mimeType, data } = parseBase64Image(imageData);
  
  // Convert base64 to blob
  const blob = base64ToBlob(data, mimeType);
  
  // Create image element to get dimensions
  const img = await loadImage(blob);
  
  // Calculate new dimensions maintaining aspect ratio
  const { width, height } = calculateDimensions(
    img.width,
    img.height,
    opts.maxWidth!,
    opts.maxHeight!
  );
  
  // Resize and compress main image
  const processedData = await resizeImage(img, width, height, opts.quality!, mimeType);
  
  // Generate thumbnail
  const thumbnailData = await generateThumbnail(img, opts.thumbnailSize!, opts.thumbnailQuality!, mimeType);
  
  // Generate URLs (for now, use data URLs - in production, these would be file paths)
  const imageUrl = generateImageUrl();
  const thumbnailUrl = generateThumbnailUrl();
  
  return {
    imageData: processedData,
    imageUrl,
    thumbnailData,
    thumbnailUrl,
    width,
    height,
    size: Math.round((processedData.length * 3) / 4), // Approximate size in bytes
  };
}

/**
 * Parse base64 image data
 */
function parseBase64Image(base64: string): { mimeType: string; data: string } {
  const matches = base64.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid base64 image data');
  }
  return {
    mimeType: matches[1],
    data: matches[2],
  };
}

/**
 * Convert base64 to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  
  return new Blob(byteArrays, { type: mimeType });
}

/**
 * Load image from blob
 */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Calculate dimensions maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth;
  let height = originalHeight;
  
  // Scale down if exceeds max dimensions
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  
  return { width, height };
}

/**
 * Resize image using canvas
 */
async function resizeImage(
  img: HTMLImageElement,
  width: number,
  height: number,
  quality: number,
  mimeType: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }
    
    // Use high-quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.drawImage(img, 0, 0, width, height);
    
    // Convert to base64 with specified quality
    const dataUrl = canvas.toDataURL(mimeType, quality);
    resolve(dataUrl);
  });
}

/**
 * Generate square thumbnail
 */
async function generateThumbnail(
  img: HTMLImageElement,
  size: number,
  quality: number,
  mimeType: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }
    
    // Calculate crop dimensions (center crop)
    const minDimension = Math.min(img.width, img.height);
    const startX = (img.width - minDimension) / 2;
    const startY = (img.height - minDimension) / 2;
    
    // Use high-quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw cropped and resized image
    ctx.drawImage(
      img,
      startX,
      startY,
      minDimension,
      minDimension,
      0,
      0,
      size,
      size
    );
    
    // Convert to base64 with specified quality
    const dataUrl = canvas.toDataURL(mimeType, quality);
    resolve(dataUrl);
  });
}

/**
 * Generate unique image URL (placeholder - in production, this would save to file storage)
 */
function generateImageUrl(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `/images/${timestamp}-${random}.jpg`;
}

/**
 * Generate unique thumbnail URL (placeholder - in production, this would save to file storage)
 */
function generateThumbnailUrl(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `/thumbnails/${timestamp}-${random}.jpg`;
}

/**
 * Get image info from base64 data
 */
export function getImageInfo(base64: string): { width: number; height: number; size: number } {
  const { mimeType, data } = parseBase64Image(base64);
  const blob = base64ToBlob(data, mimeType);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height,
        size: blob.size,
      });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  }) as any;
}

/**
 * Validate image data
 */
export function validateImageData(base64: string): boolean {
  try {
    const { mimeType } = parseBase64Image(base64);
    const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return validMimeTypes.includes(mimeType);
  } catch {
    return false;
  }
}
