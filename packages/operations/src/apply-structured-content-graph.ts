import { StructuredContentPayloadSchema } from "@cat/shared";
import * as z from "zod";

/**
 * Re-exports graph envelope and attachments helpers from @cat/domain.
 *
 * These functions live in domain to respect the @cat/db access boundary.
 * Operations imports them from here for a stable local interface.
 */
export {
  applyContentGraphEnvelope as applyStructuredContentGraphEnvelope,
  persistContentGraphAttachments as persistStructuredContentGraphAttachments,
  type AppliedGraphEnvelope,
  type ApplyContentGraphEnvelopeInput as ApplyStructuredContentGraphInput,
  type PersistContentGraphAttachmentsInput as PersistGraphAttachmentsInput,
  type PersistContentGraphAttachmentsOutput as PersistGraphAttachmentsOutput,
} from "@cat/domain";

export const ApplyStructuredContentGraphInputSchema = z.object({
  payload: StructuredContentPayloadSchema,
});
