// Pull image files out of a clipboard/drag DataTransfer. Covers both dropped/
// pasted File objects and clipboard `items` (how screenshots arrive on paste).
// Its own module so a caller (the composer's drop zone) does not pull the editor in with it.
export const extractImageFiles = (dt: DataTransfer | null): File[] => {
  if (!dt) return [];
  const out: File[] = [];
  if (dt.files && dt.files.length) {
    for (const file of Array.from(dt.files)) {
      if (file.type.startsWith('image/')) out.push(file);
    }
  }
  if (!out.length && dt.items) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) out.push(file);
      }
    }
  }
  return out;
};
