import {
  GlossaryConceptMaterializationSchema,
  type GlossaryConceptMaterialization,
} from "@cat/shared";

export const normalizeGlossaryConceptMaterialization = (
  value: GlossaryConceptMaterialization | null,
): GlossaryConceptMaterialization | null => {
  if (value === null) return null;
  const snapshot = GlossaryConceptMaterializationSchema.parse(value);
  return {
    concept: snapshot.concept,
    terms: [...snapshot.terms].sort((left, right) => left.id - right.id),
    subjects: [...snapshot.subjects].sort(
      (left, right) => left.subjectId - right.subjectId,
    ),
  };
};

export const glossaryConceptMaterializationsEqual = (
  left: GlossaryConceptMaterialization | null,
  right: GlossaryConceptMaterialization | null,
): boolean => {
  const normalizedLeft = normalizeGlossaryConceptMaterialization(left);
  const normalizedRight = normalizeGlossaryConceptMaterialization(right);
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
};
