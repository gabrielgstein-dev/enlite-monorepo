/**
 * Comprime e redimensiona uma imagem para reduzir o tamanho
 * @param dataUrl - Imagem em base64 (data URL)
 * @param maxWidth - Largura máxima (default: 400)
 * @param maxHeight - Altura máxima (default: 400)
 * @param quality - Qualidade JPEG (0-1, default: 0.8)
 * @returns Promise com a imagem comprimida em base64
 */
export function compressImage(
  dataUrl: string,
  maxWidth: number = 400,
  maxHeight: number = 400,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Compress to JPEG with specified quality
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

      // Calculate size reduction
      const originalSize = dataUrl.length;
      const compressedSize = compressedDataUrl.length;
      const reduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
      console.log(`[ImageCompression] Reduced from ${(originalSize / 1024).toFixed(1)}KB to ${(compressedSize / 1024).toFixed(1)}KB (${reduction}% reduction)`);

      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for compression'));
    };

    img.src = dataUrl;
  });
}

/**
 * Verifica se a string base64 é maior que o limite especificado
 * @param dataUrl - Imagem em base64
 * @param maxSizeKB - Tamanho máximo em KB (default: 500)
 */
export function isImageTooLarge(dataUrl: string, maxSizeKB: number = 500): boolean {
  const sizeInKB = dataUrl.length / 1024;
  return sizeInKB > maxSizeKB;
}

/**
 * Extrai apenas o dado base64 da data URL
 */
export function extractBase64FromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/base64,(.+)/);
  return match ? match[1] : dataUrl;
}

/**
 * Calcula o tamanho aproximado em KB de uma string base64
 */
export function getBase64SizeInKB(dataUrl: string): number {
  return dataUrl.length / 1024;
}
