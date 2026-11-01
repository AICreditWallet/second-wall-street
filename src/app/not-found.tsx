import { PageShell } from "@/components/site/page-shell";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageShell eyebrow="404" title="This address isn't on the map.">
      <ButtonLink href="/city">Back to the city</ButtonLink>
    </PageShell>
  );
}
