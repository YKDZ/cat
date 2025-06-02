import { prisma, PrismaDB } from "@cat/db";

const seed = async () => {
  await prisma.$transaction(async (tx) => {
    await tx.language.createMany({
      data: [
        { id: "zh_Hans", name: "简体中文" },
        { id: "en", name: "English" },
      ],
    });

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
