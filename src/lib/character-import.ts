// Préparation d'une sprite sheet avant envoi à ~/.getaroom/characters/ (navigateur uniquement).
import { removeBackground } from "./chroma-key";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_SIDE = 8192;

export interface PreparedCharacter {
  blob: Blob;
  width: number;
  height: number;
  /** Vrai si un fond uni a été détecté puis rendu transparent. */
  keyed: boolean;
  background?: [number, number, number];
}

export async function prepareCharacterImage(file: File, chroma = true): Promise<PreparedCharacter> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error("Choisis une image PNG, JPG ou WebP.");
  if (file.size > MAX_BYTES) throw new Error("L’image dépasse 20 Mo.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > MAX_SIDE || bitmap.height > MAX_SIDE) throw new Error("L’image dépasse 8192 px de côté.");
    if (bitmap.width < 4 || bitmap.height < 4) throw new Error("L’image est trop petite pour une grille 4 × 4.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas indisponible.");
    context.drawImage(bitmap, 0, 0);
    let keyed = false;
    let background: PreparedCharacter["background"];
    if (chroma) {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = removeBackground(pixels);
      if (result.applied) {
        context.putImageData(pixels, 0, 0);
        keyed = true;
        background = result.background;
      }
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Encodage PNG impossible.");
    return { blob, width: canvas.width, height: canvas.height, keyed, background };
  } finally {
    bitmap.close();
  }
}
