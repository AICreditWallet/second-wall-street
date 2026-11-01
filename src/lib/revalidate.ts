import "server-only";
import { revalidatePath } from "next/cache";

/** Refresh every public page that shows office ownership or organisation details. */
export function revalidateCity(extra: string[] = []) {
  for (const p of ["/", "/city", "/directory", "/agents", ...extra]) revalidatePath(p);
  revalidatePath("/buildings/[id]", "page");
  revalidatePath("/orgs/[slug]", "page");
}
