import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPublicTimeline = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { readPublicTimeline } = await import("./public-timeline.server");
    try {
      return await readPublicTimeline(data.userId);
    } catch (error) {
      console.error("[public-timeline]", error);
      return [];
    }
  });
