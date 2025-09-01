import { getPrismaDB, hashPassword } from "@cat/db";

const seed = async () => {
  const { client: prisma } = await getPrismaDB();

  await prisma.$transaction(async (tx) => {
    await tx.language.createMany({
      data: [
        { id: "zh_Hans", name: "简体中文" },
        { id: "en", name: "English" },
      ],
    });

    const password = "password";

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

    await tx.storageType.createMany({
      data: [{ name: "LOCAL" }, { name: "S3" }],
    });
  });
};

await seed().catch(async (e) => {
  console.error(e);
});
