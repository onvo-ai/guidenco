import { createCanvas, loadImage } from 'canvas';

const MAX_SIZE = 320;

/**
 * Resizes a base64 image string to a maximum dimension of 320px while maintaining aspect ratio.
 * 
 * @param base64String The base64 encoded image string (with or without data URI prefix)
 * @returns The resized base64 image string with data URI prefix
 */
export async function resizeImage(base64String: string): Promise<string> {
  if (!base64String) return base64String;

  try {
    // Remove data URL prefix if present to get the buffer
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    const image = await loadImage(buffer);
    let width = image.width;
    let height = image.height;

    // Calculate new dimensions
    if (width > MAX_SIZE || height > MAX_SIZE) {
      if (width > height) {
        height = Math.round((height * MAX_SIZE) / width);
        width = MAX_SIZE;
      } else {
        width = Math.round((width * MAX_SIZE) / height);
        height = MAX_SIZE;
      }
    } else {
      // If image is already small enough, just return standardized data URI format
      return base64String.startsWith('data:') ? base64String : `data:image/png;base64,${base64String}`;
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);

    const resizedBuffer = canvas.toBuffer('image/png');
    const resizedBase64 = resizedBuffer.toString('base64');

    return `data:image/png;base64,${resizedBase64}`;
  } catch (error) {
    console.error('Error resizing image:', error);
    // In case of error, return the original string
    return base64String;
  }
}
