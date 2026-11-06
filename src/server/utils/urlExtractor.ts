/**
 * Extracts valid HTTP/HTTPS URLs from a text message without fetching or downloading their contents.
 * REQ-14: กรณีอาจารย์ส่ง URL เข้ามาใน LINE OA ระบบต้องบันทึก URL ลง Database ... ห้ามดาวน์โหลดเนื้อหาจาก URL มาเก็บใน Server
 */
export function extractUrlsFromText(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const urlRegex = /https?:\/\/[^\s<>"'`]+/gi;
  const matches = text.match(urlRegex) || [];
  const cleanedUrls: string[] = [];
  const seen = new Set<string>();

  for (const raw of matches) {
    // Strip trailing punctuation often attached in chat messages
    const cleaned = raw.replace(/[).,;!?\]}]+$/, '');
    try {
      const parsed = new URL(cleaned);
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !seen.has(parsed.href)) {
        seen.add(parsed.href);
        cleanedUrls.push(parsed.href);
      }
    } catch {
      // Ignore malformed URLs
    }
  }

  return cleanedUrls;
}

