import { defineConfig } from "prisma/config";

// Prisma CLI uses the owner URL only for migrations and schema commands.
const datasourceUrl = process.env.DIRECT_URL;
if (!datasourceUrl) throw new Error("DIRECT_URL is required for Prisma commands");

export default defineConfig({
    schema: "prisma/schema.prisma",
    datasource: { url: datasourceUrl },
});
