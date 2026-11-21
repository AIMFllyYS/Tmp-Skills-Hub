import type { FileUIPart, TextUIPart } from "ai";

export interface Attachment { id: string; name: string; bytes: number; part: FileUIPart | TextUIPart }
export const attachmentLimit = 768 * 1024;
const imageType: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
export const acceptedFiles = ".md,.txt,.json,.csv,.yaml,.yml,.log,.png,.jpg,.jpeg,.webp";

export async function readAttachment(file: File): Promise<Attachment> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!acceptedFiles.split(",").includes("." + extension)) throw new Error("请选择文本、Markdown、JSON、CSV、YAML、日志或图片。");
  if (file.size > attachmentLimit) throw new Error("单次附件总大小上限为 768 KB。");
  const mediaType = imageType[extension];
  const common = { id: crypto.randomUUID(), name: file.name, bytes: file.size };
  if (mediaType) {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file.slice(0, file.size, mediaType));
    });
    return { ...common, part: { type: "file", mediaType, filename: file.name, url } };
  }
  const content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  return { ...common, part: { type: "text", text: "附件 · " + file.name + "\n" + content } };
}
