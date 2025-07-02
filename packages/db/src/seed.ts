import { prisma, PrismaDB } from "./prisma";
import { randomBytes } from "crypto";
import { hashPassword } from "./utils/password";

const seed = async () => {
  await prisma.$transaction(async (tx) => {
    await tx.language.createMany({
      data: [
        { id: "zh_Hans", name: "简体中文" },
        { id: "en", name: "English" },
      ],
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

    await tx.fileType.createMany({
      data: [
        {
          name: "PNG",
          mimeType: "image/png",
        },
        {
          name: "JSON",
          mimeType: "application/json",
        },
      ],
    });

    await tx.storageType.createMany({
      data: [{ name: "LOCAL" }, { name: "S3" }],
    });
  });
};

PrismaDB.connect().then(async () => {
  const languages = await prisma.language.findMany();
  const fileTypes = await prisma.fileType.findMany();
  const storageTypes = await prisma.storageType.findMany();

  if (
    languages.length !== 0 ||
    fileTypes.length !== 0 ||
    storageTypes.length !== 0
  ) {
    console.log("Skipping seeding due to existing basic data");
    return;
  }

  await seed()
    .catch(async (e) => {
      console.error(e);
    })
    .finally(async () => {
      await PrismaDB.disconnect();
    });
});
