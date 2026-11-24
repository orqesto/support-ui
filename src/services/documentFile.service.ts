import { apiClient } from '@/lib/api-client';
import {
  normalizeAttachmentPreview,
  type AttachmentPreview,
} from '@/services/attachmentFile.service';

/**
 * A knowledge-base document's uploaded file, for the shared file viewer. The backend scopes both
 * routes like the document itself (its workspace, and its teams when it is team-scoped).
 */
export const documentFileService = {
  /**
   * The original bytes (`/api/documentation/:id/raw`). `display`: the bytes to SHOW — a TIFF
   * then arrives as a WEBP the browser can draw; Download asks for the original.
   */
  async getBlob(documentId: number, display: boolean): Promise<Blob> {
    const response = display
      ? await apiClient.get(`/api/documentation/${documentId}/raw?display=1`, {
          responseType: 'blob',
        })
      : await apiClient.get(`/api/documentation/${documentId}/raw`, { responseType: 'blob' });
    return response.data as Blob;
  },

  /** A .docx rendered to html, or an .xlsx read into sheets — the attachment preview's shape. */
  async getPreview(documentId: number): Promise<AttachmentPreview> {
    const response = await apiClient.get(`/api/documentation/${documentId}/preview`);
    return normalizeAttachmentPreview(response.data);
  },
};
