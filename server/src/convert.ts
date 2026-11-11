import mammoth from "mammoth";
import { marked } from "marked";
import path from "node:path";
import sanitizeHtml from "sanitize-html";
import { HttpError } from "./errors.js";

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Restricts stored HTML to the subset the editor can represent. Anything else
 * (scripts, styles, event handlers, images, tables) is dropped on the way in.
 */
export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "strike",
      "ul", "ol", "li", "blockquote", "code", "pre", "hr",
    ],
    allowedAttributes: {},
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export interface ConvertedFile {
  title: string;
  html: string;
}

export async function convertUpload(originalName: string, buffer: Buffer): Promise<ConvertedFile> {
  const ext = path.extname(originalName).toLowerCase();
  const title = path.basename(originalName, path.extname(originalName)).trim().slice(0, 200) || "Imported document";

  let html: string;
  switch (ext) {
    case ".txt":
      html = textToHtml(buffer.toString("utf8"));
      break;
    case ".md":
    case ".markdown":
      html = await marked.parse(buffer.toString("utf8"), { gfm: true });
      break;
    case ".docx":
      try {
        html = (await mammoth.convertToHtml({ buffer })).value;
      } catch {
        throw new HttpError(400, "Could not read that .docx file — is it a valid Word document?");
      }
      break;
    default:
      throw new HttpError(400, `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }

  const clean = sanitizeDocumentHtml(html);
  if (!clean.trim()) throw new HttpError(400, "That file appears to be empty");
  return { title, html: clean };
}
