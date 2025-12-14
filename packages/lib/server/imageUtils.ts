// 將 sharp 替換為 jimp 和 svg2png-wasm
import Jimp from "jimp";
import { svg2png } from "svg2png-wasm";

// 注意: 導入方式可能根據庫而異，這裡假設導出了一個 svg2png 函數

// Maximum allowed size for SVG data (5MB)
const MAX_SVG_SIZE = 5 * 1024 * 1024;

const JPEG = "image/jpeg";
const PNG = "image/png";
const WEBP = "image/webp";
const AVIF = "image/avif"; // Jimp 不支援 AVIF，處理時會降級
const GIF = "image/gif";
const SVG = "image/svg+xml";

/**
 * Converts an SVG image to PNG format using svg2png-wasm (Replaces sharp usage).
 * @param data Base64 encoded image data
 * @returns Base64 encoded PNG data or a placeholder image if conversion fails
 */
export const convertSvgToPng = async (data: string) => {
  if (data.startsWith("data:image/svg+xml;base64,")) {
    try {
      const base64Data = data.replace(/^data:image\/svg\+xml;base64,/, "");
      // SVG 原始資料是 XML 格式，需要將 Base64 轉換回字串才能傳給 svg2png-wasm
      const svgString = Buffer.from(base64Data, "base64").toString("utf-8");

      // Check if the SVG data exceeds the size limit
      if (Buffer.byteLength(svgString, "utf-8") > MAX_SVG_SIZE) {
        throw new Error("SVG data exceeds maximum allowed size");
      }

      // 使用 svg2png-wasm 進行轉換
      // svg2png-wasm 接受 SVG 字串或 Buffer，並返回 PNG Buffer
      const pngBuffer = await svg2png(svgString, {
        // 設定渲染尺寸，預設可能為 100x100，但您的原始程式碼沒有指定尺寸。
        // 在這裡，我們假設如果未指定，則使用 SVG 內部 viewBox/width/height。
        // 如果需要，您可以添加 width/height 選項: width: 100, height: 100
      });

      // return `data:image/png;base64,${pngBuffer.toString("base64")}`;
      return `data:image/png;base64,${(pngBuffer.toString as (encoding: string) => string)("base64")}`;
    } catch (error) {
      console.error("Error converting SVG to PNG", error);
      // Return a 1x1 transparent PNG as placeholder
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    }
  }
  return data;
};

/**
 * Detect content type from image buffer.
 * Jimp-based detection is REMOVED, relying ONLY on magic number checks.
 * AVIF detection is kept but Jimp cannot process AVIF.
 */
export async function detectContentType(buffer: Buffer): Promise<string | null> {
  // --- Start: Magic Number Check (保持不變) ---
  if ([0xff, 0xd8, 0xff].every((b, i) => buffer[i] === b)) {
    return JPEG;
  }
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buffer[i] === b)) {
    return PNG;
  }
  if ([0x47, 0x49, 0x46, 0x38].every((b, i) => buffer[i] === b)) {
    return GIF;
  }
  if ([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50].every((b, i) => !b || buffer[i] === b)) {
    return WEBP;
  }
  // 檢查 SVG 的兩種常見開頭
  if ([0x3c, 0x3f, 0x78, 0x6d, 0x6c].every((b, i) => buffer[i] === b)) {
    return SVG;
  }
  if ([0x3c, 0x73, 0x76, 0x67].every((b, i) => buffer[i] === b)) {
    return SVG;
  }
  if ([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66].every((b, i) => !b || buffer[i] === b)) {
    return AVIF;
  }
  // --- End: Magic Number Check ---

  // Fallback to sharp metadata detection (已移除)
  return null;
}

/**
 * Resize an image buffer using Jimp (Replaces sharp usage).
 * NOTE: Jimp does not support AVIF and lacks precise optimization features.
 */
export async function resizeImage(params: {
  buffer: Buffer;
  width: number;
  height?: number;
  quality?: number;
  contentType?: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const { buffer, width, height, quality = 100 } = params;
  let { contentType } = params;

  // Auto-detect content type if not provided
  if (!contentType) {
    contentType = (await detectContentType(buffer)) ?? PNG;
  }

  // Jimp 讀取 buffer
  let image;
  try {
    // Jimp.read 處理 buffer
    image = await Jimp.read(buffer);
  } catch (error) {
    console.error("Jimp failed to read image buffer:", error);
    // 如果 Jimp 無法讀取，則返回原始緩衝區（或拋出錯誤）
    return { buffer, contentType: contentType ?? PNG };
  }

  // 1. 調整大小
  // 旋轉: Jimp 會自動處理 JPEG 的 EXIF 旋轉標記。
  if (height) {
    // 裁剪並調整大小
    image.resize(width, height, Jimp.RESIZE_BILINEAR);
  } else {
    // 保持比例。Jimp 沒有 withoutEnlargement 選項。
    image.resize(width, Jimp.AUTO, Jimp.RESIZE_BILINEAR);
  }

  // 2. 應用格式轉換與優化
  let finalContentType = contentType;
  let optimizedBuffer: Buffer;

  // Jimp 不支援 AVIF，因此降級處理
  if (contentType === AVIF) {
    // 降級為 JPEG
    optimizedBuffer = await image.quality(quality).getBufferAsync(Jimp.MIME_JPEG);
    finalContentType = JPEG;
    console.warn("AVIF detected, but Jimp does not support AVIF. Converting to JPEG.");
  } else if (contentType === WEBP) {
    optimizedBuffer = await image.quality(quality).getBufferAsync("image/webp");
  } else if (contentType === PNG || contentType === GIF) {
    // Jimp 支援 PNG 壓縮 (但質量控制不如 sharp)
    optimizedBuffer = await image.getBufferAsync(contentType === PNG ? Jimp.MIME_PNG : Jimp.MIME_GIF);
  } else if (contentType === JPEG) {
    // Jimp 支援 JPEG 質量設定 (但沒有 mozjpeg 選項)
    optimizedBuffer = await image.quality(quality).getBufferAsync(Jimp.MIME_JPEG);
  } else {
    // For unknown formats, default to PNG
    optimizedBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
    finalContentType = PNG;
  }

  return { buffer: optimizedBuffer, contentType: finalContentType };
}
