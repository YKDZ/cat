import * as z from "zod";

/** Identifier syntax shared by plugin manifests and persisted references. */
export const PluginIdentifierSchema = z
  .string()
  .regex(
    /^(?:[A-Za-z0-9\-_.!~*'()]+|%[0-9A-Fa-f]{2})+$/,
    "The plugin ID does not meet the requirements. It needs to be a string that can be used for URL fragments",
  )
  .brand<"PluginIdentifier">();

export type PluginIdentifier = z.infer<typeof PluginIdentifierSchema>;

/** A canonical non-empty logical service identifier. */
export const ServiceIdentifierSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.trim() === value && value.trim().length > 0,
    "The service ID must be non-blank and canonical",
  )
  .brand<"ServiceIdentifier">();

export type ServiceIdentifier = z.infer<typeof ServiceIdentifierSchema>;

/** Canonical non-global installation key. */
export const ScopedInstallationIdentifierSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.trim() === value && value.trim().length > 0,
    "The installation scope ID must be non-blank and canonical",
  )
  .brand<"ScopedInstallationIdentifier">();

export type ScopedInstallationIdentifier = z.infer<
  typeof ScopedInstallationIdentifierSchema
>;
