import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ContentMap } from "@/lib/siteContent";

/**
 * Admin overrides for site copy whose keys start with `prefix` (e.g. "home.").
 * Returns {} if the table is unavailable, so pages fall back to defaults.
 */
export const getSiteContentServer = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ prefix: z.string().max(40) }).parse(data))
  .handler(async ({ data }): Promise<ContentMap> => {
    const { data: rows, error } = await supabaseAdmin
      .from("site_content")
      .select("key, value")
      .like("key", `${data.prefix}%`);
    if (error) {
      console.error("site content unavailable", error.message);
      return {};
    }
    return Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
  });
