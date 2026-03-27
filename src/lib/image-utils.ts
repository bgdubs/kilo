/**
 * Image processing utilities for resizing, compression, and thumbnail generation
 * Uses sharp for server-side image processing
 */

import sharp from 'sharp';

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
  quality?: number; // 1-100
  thumbnailSize?: number; // Square thumbnail size
  thumbnailQuality?: number; // 1-100
}

const DEFAULT_OPTIONS: ImageProcessingOptions = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 85,
  thumbnailSize: 200,
  thumbnailQuality: 75,
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

  // Convert base64 to buffer
  const buffer = Buffer.from(data, 'base64');

  // Rotate first so all subsequent dimension calculations use post-rotation coords
  const rotatedBuffer = await sharp(buffer).rotate().toBuffer();

  // Get image metadata from rotated buffer
  const metadata = await sharp(rotatedBuffer).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  // Calculate new dimensions maintaining aspect ratio
  const { width, height } = calculateDimensions(
    originalWidth,
    originalHeight,
    opts.maxWidth!,
    opts.maxHeight!
  );

  // Resize and compress main image (no .rotate() — already applied above)
  const processedBuffer = await sharp(rotatedBuffer)
    .resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: opts.quality! })
    .toBuffer();

  // Generate thumbnail
  const thumbnailBuffer = await generateThumbnail(rotatedBuffer, opts.thumbnailSize!, opts.thumbnailQuality!);

  // Generate URLs (for now, use data URLs - in production, these would be file paths)
  const imageUrl = generateImageUrl();
  const thumbnailUrl = generateThumbnailUrl();

  return {
    imageData: `data:${mimeType};base64,${processedBuffer.toString('base64')}`,
    imageUrl,
    thumbnailData: `data:${mimeType};base64,${thumbnailBuffer.toString('base64')}`,
    thumbnailUrl,
    width,
    height,
    size: processedBuffer.length,
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
 * Generate square thumbnail
 */
async function generateThumbnail(
  buffer: Buffer,
  size: number,
  quality: number
): Promise<Buffer> {
  // Get image metadata (buffer is already rotated)
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  // Calculate crop dimensions (center crop)
  const minDimension = Math.min(originalWidth, originalHeight);
  const startX = Math.floor((originalWidth - minDimension) / 2);
  const startY = Math.floor((originalHeight - minDimension) / 2);

  // Extract square crop and resize (no .rotate() — buffer is already rotated)
  return await sharp(buffer)
    .extract({
      left: startX,
      top: startY,
      width: minDimension,
      height: minDimension,
    })
    .resize(size, size, {
      fit: 'cover',
    })
    .jpeg({ quality })
    .toBuffer();
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
export async function getImageInfo(base64: string): Promise<{ width: number; height: number; size: number }> {
  const { data } = parseBase64Image(base64);
  const buffer = Buffer.from(data, 'base64');
  const rotatedBuffer = await sharp(buffer).rotate().toBuffer();
  const metadata = await sharp(rotatedBuffer).metadata();

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    size: buffer.length,
  };
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
