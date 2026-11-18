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

/** A decoded photo: what the preview and the export both draw from. */
export type Picture = {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Frees the decoded pixels (a 48 MP photo is ~190 MB): call when the picture is done with. */
  close: () => void;
};

/**
 * Decodes the picked file straight into a bitmap: no URL of the file is ever made (an object URL
 * fed to an <img> is what code scanning reads as DOM text reaching HTML). The browser applies the
 * EXIF orientation while decoding. Rejects when the file is not an image it can read.
 */
export const PHOTO_UNREADABLE = 'We couldn’t read that image. Try another photo.';

export const openPhoto = async (file: Blob): Promise<Picture> => {
  // The decoder's own error says nothing a person can act on: ours does.
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(PHOTO_UNREADABLE);
  });
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  };
};

/** Draws the framed square of `picture` onto a `side`×`side` canvas, over white. */
export const drawFramed = (
  context: CanvasRenderingContext2D,
  picture: Picture,
  view: PhotoView,
  side: number
): void => {
  const natural = { width: picture.width, height: picture.height };
  const region = visibleRegion(natural, clampView(natural, view));
  // JPEG has no transparency: paint white first, or a transparent PNG gets black corners.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, side, side);
  context.drawImage(picture.source, region.x, region.y, region.side, region.side, 0, 0, side, side);
};

/** The framed square as a JPEG of OUTPUT_PX — exactly what the preview circle showed. */
export const cropPhoto = async (picture: Picture, view: PhotoView): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_PX;
  canvas.height = OUTPUT_PX;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo could not be prepared');
  drawFramed(context, picture, view, OUTPUT_PX);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Photo could not be prepared'))),
      'image/jpeg',
      0.9
    )
  );
};
