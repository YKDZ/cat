import { prisma, PrismaDB } from "./prisma";

const userId = "cmaf0crxi00006dng8fdnixi0";

const seed = async () => {
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

    await tx.user.create({
      data: {
        id: userId,
        name: "YKDZ",
        email: "3070799584@qq.com",
        emailVerified: true,
      },
    });

    await tx.glossary.create({
      data: {
        name: "Minecraft",
        creatorId: userId,
        Terms: {
          create: terms.map(({ value, languageId, translations }) => ({
            value,
            languageId,
            creatorId: userId,
            Transations: {
              create: translations.map((translation) => ({
                value: translation.value,
                languageId: translation.languageId,
                creatorId: userId,
              })),
            },
          })),
        },
      },
    });
  });
};

PrismaDB.connect().then(async () => {
  await seed()
    .catch(async (e) => {
      console.error(e);
    })
    .finally(async () => {
      await PrismaDB.disconnect();
    });
});

const terms = [
  {
    value: "player",
    languageId: "en",
    translations: [
      {
        value: "玩家",
        languageId: "zh_Hans",
      },
    ],
  },
  {
    value: "block",
    languageId: "en",
    translations: [
      {
        value: "方块",
        languageId: "zh_Hans",
      },
    ],
  },
  {
    value: "elytra",
    languageId: "en",
    translations: [
      {
        value: "鞘翅",
        languageId: "zh_Hans",
      },
    ],
  },
  {
    value: "nether",
    languageId: "en",
    translations: [
      {
        value: "下界",
        languageId: "zh_Hans",
      },
    ],
  },
  {
    value: "ghast",
    languageId: "en",
    translations: [
      {
        value: "恶魂",
        languageId: "zh_Hans",
      },
    ],
  },
  {
    value: "sniffer",
    languageId: "en",
    translations: [
      {
        value: "嗅探兽",
        languageId: "zh_Hans",
      },
    ],
  },
  {
    value: "skeleton",
    languageId: "en",
    translations: [
      {
        value: "骷髅",
        languageId: "zh_Hans",
      },
    ],
  },
  {
    value: "advancement",
    languageId: "en",
    translations: [
      {
        value: "进度",
        languageId: "zh_Hans",
      },
    ],
  },
  {
    value: "pillager",
    languageId: "en",
    translations: [
      {
        value: "掠夺者",
        languageId: "zh_Hans",
      },
    ],
  },
  {
    value: "powder snow",
    languageId: "en",
    translations: [
      {
        value: "细雪",
        languageId: "zh_Hans",
      },
    ],
  },
];
