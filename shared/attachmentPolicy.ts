const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/xml",
  "text/xml",
  "application/octet-stream",
]);

export const MAX_COMMENT_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export function sanitizeAttachmentFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "anexo";
}

export function validateCommentAttachment(input: { filename: string; mimeType: string; size: number }) {
  if (!input.filename.trim()) return "Anexo sem nome de arquivo.";
  if (!Number.isInteger(input.size) || input.size <= 0) return "Tamanho de anexo inválido.";
  if (input.size > MAX_COMMENT_ATTACHMENT_BYTES) return "Cada anexo deve ter no máximo 5 MB.";
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(input.mimeType)) return "Formato de anexo não permitido.";
  return null;
}
