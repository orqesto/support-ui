/**
 * Framing math for the profile photo picker, shared by the preview (CSS) and the export (canvas),
 * so what is saved is exactly what the person saw in the circle.
 *
 * The image first COVERS the square frame (its short side = the frame), is then scaled by `zoom`
 * (1-3), and moved by `offsetX/offsetY` (frame pixels, from centred). Offsets are clamped so the
 * image always covers the frame: no empty corner can be saved.
 */
export const FRAME_PX = 240;
/** Uploaded side; the server stores 256 px, this leaves it room to downscale cleanly. */
export const OUTPUT_PX = 512;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export type PhotoView = { zoom: number; offsetX: number; offsetY: number };
export type Size = { width: number; height: number };

/** Displayed image size in frame pixels at `zoom`. */
export const shownSize = (natural: Size, zoom: number, frame = FRAME_PX): Size => {
  const scale = (frame / Math.min(natural.width, natural.height)) * zoom;
  return { width: natural.width * scale, height: natural.height * scale };
};

/** `view` with its offsets pulled back so the image still covers the frame. */
export const clampView = (natural: Size, view: PhotoView, frame = FRAME_PX): PhotoView => {
  const shown = shownSize(natural, view.zoom, frame);
  const maxX = Math.max(0, (shown.width - frame) / 2);
  const maxY = Math.max(0, (shown.height - frame) / 2);
  return {
    zoom: view.zoom,
    offsetX: Math.min(maxX, Math.max(-maxX, view.offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, view.offsetY)),
  };
};

/** The part of the original image inside the frame, in the image's own pixels. */
export const visibleRegion = (
  natural: Size,
  view: PhotoView,
  frame = FRAME_PX
): { x: number; y: number; side: number } => {
  const shown = shownSize(natural, view.zoom, frame);
  const scale = shown.width / natural.width;
  return {
    x: ((shown.width - frame) / 2 - view.offsetX) / scale,
    y: ((shown.height - frame) / 2 - view.offsetY) / scale,
    side: frame / scale,
  };
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Photo could not be read'));
    image.src = src;
  });

/** The framed square as a JPEG of OUTPUT_PX (the browser applies EXIF orientation on load). */
export const cropPhoto = async (src: string, view: PhotoView): Promise<Blob> => {
  const image = await loadImage(src);
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  const region = visibleRegion(natural, clampView(natural, view));
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_PX;
  canvas.height = OUTPUT_PX;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo could not be prepared');
  context.drawImage(image, region.x, region.y, region.side, region.side, 0, 0, OUTPUT_PX, OUTPUT_PX);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Photo could not be prepared'))),
      'image/jpeg',
      0.9
    )
  );
};
