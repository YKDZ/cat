// @boundaries-ignore root config inheritance
// This script will never run in this package
// but in built apps/app docker container where have @cat/db dependency
import type { PrismaClient } from "@cat/db";
import { PrismaDB, hashPassword } from "@cat/db";
import { randomBytes } from "crypto";

const seed = async (prisma: PrismaClient) => {
  await prisma.$transaction(async (tx) => {
    await tx.language.createMany({
      data: [
        { id: "zh_Hans", name: "简体中文" },
        { id: "en", name: "English" },
      ],
    });

    await tx.storageType.createMany({
      data: [{ name: "LOCAL" }, { name: "S3" }],
    });

    const password =
      process.env.NODE_ENV !== "production"
        ? "password"
        : randomBytes(8).toString("hex");

    await tx.user.create({
      data: {
        name: "admin",
        email: "admin@encmys.cn",
        emailVerified: true,
        UserRoles: {
          create: {
            Role: {
              create: {
                name: "Root Admin",
                RolePermissions: {
                  create: [
                    {
                      Permission: {
                        create: {
                          resource: "*",
                          action: "*",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        Accounts: {
          create: {
            type: "ID_PASSWORD",
            provider: "EMAIL_PASSWORD",
            providedAccountId: "admin@encmys.cn",
            meta: {
              password: await hashPassword(password),
            },
          },
        },
      },
    });

    console.log(`Default admin password is: ${password}`);
  });
};

(async () => {
  const db = new PrismaDB();
  await db.connect();
  await db.ping();

  const prisma = db.client;

  const languages = await prisma.language.findMany();
  const storageTypes = await prisma.storageType.findMany();

  if (languages.length !== 0 || storageTypes.length !== 0) {
    console.log("Skipping seeding due to existing basic data");
    return;
  }

  await seed(prisma)
    .catch(async (e) => {
      console.error(e);
    })
    .finally(async () => {
      await db.disconnect();
    });
})();
