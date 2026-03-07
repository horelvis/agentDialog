import { loader } from "fumadocs-core/source";
import { docs as docsSource } from "@/../.source/server";

export const docs = loader({
  baseUrl: "/docs",
  source: docsSource.toFumadocsSource(),
});
