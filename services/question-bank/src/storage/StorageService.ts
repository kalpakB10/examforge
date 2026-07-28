import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

export interface StorageService {
  save(fileBuffer: Buffer, originalName: string): Promise<string>;
  delete(url: string): Promise<void>;
  uploadsDir: string;
}

// Magic bytes for allowed image types
const IMAGE_SIGNATURES: Array<{ bytes: number[]; mime: string }> = [
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },        // JPEG
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },   // PNG
  { bytes: [0x47, 0x49, 0x46], mime: "image/gif" },          // GIF
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" },  // WEBP (RIFF header)
];

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageBuffer(buf: Buffer): void {
  if (buf.length > MAX_SIZE_BYTES) {
    throw new Error(`Image exceeds 5 MB limit (got ${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
  }
  const matched = IMAGE_SIGNATURES.some((sig) =>
    sig.bytes.every((byte, i) => buf[i] === byte)
  );
  if (!matched) {
    throw new Error("Invalid image format — allowed: jpg, jpeg, png, gif, webp");
  }
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
}

export class LocalStorageService implements StorageService {
  uploadsDir: string;
  private staticPrefix: string;

  constructor(uploadsDir: string, staticPrefix = "/static/question-images") {
    this.uploadsDir = uploadsDir;
    this.staticPrefix = staticPrefix;
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  async save(fileBuffer: Buffer, originalName: string): Promise<string> {
    validateImageBuffer(fileBuffer);
    const safe = sanitizeFilename(path.basename(originalName));
    const filename = `${uuidv4()}-${safe}`;
    const dest = path.join(this.uploadsDir, filename);
    fs.writeFileSync(dest, fileBuffer);
    return `${this.staticPrefix}/${filename}`;
  }

  async delete(url: string): Promise<void> {
    const filename = path.basename(url);
    const filePath = path.join(this.uploadsDir, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}
