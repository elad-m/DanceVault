import { prisma } from "../src/db";

async function seed() {
    await prisma.user.upsert({
        where: {
            id: "initial-user",
        },
        update: {},
        create: {
            id: "initial-user",
            email: "owner@dancevault.local",
        },
    });
}

seed()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.error(error);
        await prisma.$disconnect();
        process.exitCode = 1;
    });
