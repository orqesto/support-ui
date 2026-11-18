/** The photo fills the circle it sits in; `hidden` until loaded (never `block` alongside it). */
export const userPhotoClasses = (loaded: boolean): string =>
  loaded ? 'block w-full h-full rounded-full object-cover' : 'hidden';
