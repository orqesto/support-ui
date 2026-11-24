/**
 * Test copy of the backend chunker, so the seam tests run against the rule that really cuts the
 * stored chunks. Copied from BE-service `src/modules/documentation/services/documentationChunkingService.ts`
 * (`CHUNKING_CONFIGS`, `MANUAL_STRATEGIES`, `chunkTextWithConfig`) on origin/staging 0f87e28f2,
 * 2026-11-24. If the backend changes its sizes or overlaps, change both this copy and
 * `joinChunks.ts`.
 */

export type BeChunkConfig = { chunkSize: number; overlap: number; minChunkSize: number };

export const BE_CONFIGS: Record<string, BeChunkConfig> = {
  technical: { chunkSize: 1000, overlap: 200, minChunkSize: 50 },
  nda: { chunkSize: 8000, overlap: 0, minChunkSize: 200 },
  legal: { chunkSize: 5000, overlap: 500, minChunkSize: 200 },
  policy: { chunkSize: 2000, overlap: 300, minChunkSize: 100 },
  template: { chunkSize: 50000, overlap: 0, minChunkSize: 50 },
  general: { chunkSize: 1500, overlap: 250, minChunkSize: 50 },
};

export const BE_STRATEGIES: Record<string, BeChunkConfig> = {
  small: { chunkSize: 800, overlap: 150, minChunkSize: 50 },
  medium: { chunkSize: 2000, overlap: 300, minChunkSize: 100 },
  large: { chunkSize: 5000, overlap: 500, minChunkSize: 200 },
  whole: { chunkSize: 100000, overlap: 0, minChunkSize: 50 },
};

export const beChunk = (text: string, config: BeChunkConfig): string[] => {
  const chunks: string[] = [];
  let startIndex = 0;
  if (text.length <= config.chunkSize) {
    const trimmed = text.trim();
    return trimmed.length >= config.minChunkSize ? [trimmed] : [];
  }
  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + config.chunkSize, text.length);
    const trimmed = text.substring(startIndex, endIndex).trim();
    if (trimmed.length >= config.minChunkSize) chunks.push(trimmed);
    startIndex += config.chunkSize - config.overlap;
    if (config.overlap >= config.chunkSize) startIndex = endIndex;
  }
  return chunks;
};

/** An invented, non-repeating Markdown document of about `length` characters. */
export const inventedDocument = (length: number): string => {
  const parts: string[] = [];
  let size = 0;
  for (let section = 1; size < length; section++) {
    const block = [
      `## Section ${section}: delivery zone ${section * 7}`,
      '',
      `Parcels for zone ${section * 7} leave the warehouse on day ${section % 5} and arrive within ${section + 2} working days.`,
      `Returns for order group ${section * 13} are accepted for ${section + 30} days after delivery.`,
      '',
      `- Carrier option ${section}a costs ${section}.50 EUR`,
      `- Carrier option ${section}b costs ${section + 1}.25 EUR`,
      '',
      `| Item ${section} | Weight | Price |`,
      '| --- | --- | --- |',
      `| Box ${section} | ${section * 3} kg | ${section * 11} EUR |`,
      '',
    ].join('\n');
    parts.push(block);
    size += block.length + 1;
  }
  return parts.join('\n');
};
