// Building images are shrunk in the browser before upload so the site can serve them
// straight from Supabase (images.unoptimized). Same approach as Shelby's product photos,
// with a larger limit because facades need detail for the clickable regions.
const MAX_SIDE = 2400;
const QUALITY = 0.85;

export type PreparedImage = { file: File; width: number; height: number };

// Returns the file to upload and its pixel size (stored with the view; the hotspot
// overlay needs the aspect ratio). SVGs are kept as they are.
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.type === "image/svg+xml") {
    const { width, height } = await naturalSize(URL.createObjectURL(file));
    return { file, width, height };
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff"; // JPEG has no alpha; flatten transparent PNGs onto white
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob || (scale === 1 && blob.size >= file.size && file.type === "image/jpeg")) return { file, width, height };
  return { file: new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" }), width, height };
}

function naturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1600, height: img.naturalHeight || 1000 });
    img.onerror = reject;
    img.src = src;
  });
}
