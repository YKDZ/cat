import { prisma } from "@cat/db";
import { expect, test } from "@playwright/test";
import {
  Document,
  DocumentVersion,
  Project,
  TranslatableElement,
  File,
  StorageType,
  Glossary,
  TermRelation,
  Term,
  MemoryItem,
  Memory,
} from "@cat/shared";

test.describe.serial(() => {});
