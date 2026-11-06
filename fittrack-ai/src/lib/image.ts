"use client";

/**
 * Ridimensiona l'immagine nel browser (lato lungo max 1568 px, consigliato per la
 * visione di Claude) e la converte in JPEG per ridurre tempi di upload e costi.
 */
export async function prepareImage(file: File, maxSide = 1568, quality = 0.85) {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non supportato");
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ("close" in bitmap) (bitmap as ImageBitmap).close();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" as const };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fallback sotto
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Formato immagine non supportato. Usa JPEG o PNG."));
    };
    img.src = url;
  });
}
