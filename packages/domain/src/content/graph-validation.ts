import type {
  RegisteredRelationTypeInput,
  StructuredContentPayload,
  StructuredRelationInput,
} from "@cat/shared";

type EndpointKey = `NODE:${string}` | `ELEMENT:${string}`;

const endpointKey = (
  endpoint: StructuredRelationInput["target"],
): EndpointKey => {
  if (endpoint.kind === "NODE") return `NODE:${endpoint.nodeRef}`;
  return `ELEMENT:${endpoint.elementRef}`;
};

const relationTypeKey = (type: StructuredRelationInput["type"]): string => {
  return `${type.namespace}:${type.name}:${type.version ?? "1.0.0"}`;
};

const isExportableNode = (
  node: StructuredContentPayload["nodes"][number],
): boolean => node.exportRole !== "PROJECT_ROOT" && node.exportRole !== "NONE";

export const assertStructuredPayloadGraphValid = (
  payload: StructuredContentPayload,
  registeredRelationTypes: readonly RegisteredRelationTypeInput[],
): void => {
  const nodeRefs = new Set(payload.nodes.map((node) => node.ref));
  const elementRefs = new Set(payload.elements.map((element) => element.ref));
  const relationTypes = new Map(
    registeredRelationTypes.map((type) => [
      `${type.namespace}:${type.name}:${type.version}`,
      type,
    ]),
  );

  const primaryTargets = new Map<EndpointKey, number>();

  for (const relation of payload.relations) {
    const type = relationTypes.get(relationTypeKey(relation.type));
    if (!type) {
      throw new Error(
        `Unknown relation type ${relationTypeKey(relation.type)}`,
      );
    }

    const pairAllowed = type.allowedEndpointPairs.some(
      (pair) =>
        pair.source === relation.source.kind &&
        pair.target === relation.target.kind,
    );
    if (!pairAllowed) {
      throw new Error(
        `Relation ${relationTypeKey(relation.type)} does not allow ${relation.source.kind}->${relation.target.kind}`,
      );
    }

    if (
      relation.source.kind === "NODE" &&
      !nodeRefs.has(relation.source.nodeRef)
    ) {
      throw new Error(
        `Relation source node ${relation.source.nodeRef} is missing`,
      );
    }
    if (
      relation.source.kind === "ELEMENT" &&
      !elementRefs.has(relation.source.elementRef)
    ) {
      throw new Error(
        `Relation source element ${relation.source.elementRef} is missing`,
      );
    }
    if (
      relation.target.kind === "NODE" &&
      !nodeRefs.has(relation.target.nodeRef)
    ) {
      throw new Error(
        `Relation target node ${relation.target.nodeRef} is missing`,
      );
    }
    if (
      relation.target.kind === "ELEMENT" &&
      !elementRefs.has(relation.target.elementRef)
    ) {
      throw new Error(
        `Relation target element ${relation.target.elementRef} is missing`,
      );
    }

    if (relation.isPrimary) {
      const key = endpointKey(relation.target);
      primaryTargets.set(key, (primaryTargets.get(key) ?? 0) + 1);
    }
  }

  const primaryNodeParents = new Map<string, string>();
  for (const relation of payload.relations) {
    if (
      !relation.isPrimary ||
      relation.source.kind !== "NODE" ||
      relation.target.kind !== "NODE"
    ) {
      continue;
    }
    primaryNodeParents.set(relation.target.nodeRef, relation.source.nodeRef);
  }

  for (const node of payload.nodes) {
    const seen = new Set<string>();
    let current: string | undefined = node.ref;
    while (current) {
      if (seen.has(current)) {
        throw new Error(`Primary containment cycle detected at ${current}`);
      }
      seen.add(current);
      current = primaryNodeParents.get(current);
    }
  }

  for (const node of payload.nodes) {
    if (!isExportableNode(node)) continue;
    const count = primaryTargets.get(`NODE:${node.ref}`) ?? 0;
    if (count !== 1) {
      throw new Error(
        `Content node ${node.ref} must have exactly one primary parent relation`,
      );
    }
  }

  for (const element of payload.elements) {
    const count = primaryTargets.get(`ELEMENT:${element.ref}`) ?? 0;
    if (count !== 1) {
      throw new Error(
        `Element ${element.ref} must have exactly one primary parent relation`,
      );
    }
  }
};
