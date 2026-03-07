import { createSearchAPI } from "fumadocs-core/search/server";
import { docs } from "@/lib/source";

export const { GET } = createSearchAPI("advanced", {
  indexes: docs.getPages().map((page) => ({
    title: page.data.title,
    description: page.data.description,
    structuredData: page.data.structuredData,
    id: page.url,
    url: page.url,
  })),
});
