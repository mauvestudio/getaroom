import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScrollArea } from "./scroll-area";

// Régression : sans barre montée, Radix passait la zone en overflow:hidden → plus de défilement.
test("hideScrollbar : la zone reste défilable et la barre est montée mais invisible", () => {
  const html = renderToStaticMarkup(<ScrollArea hideScrollbar><p>contenu</p></ScrollArea>);
  expect(html).toContain("!overflow-y-auto");
});

test("sans hideScrollbar : comportement inchangé", () => {
  const html = renderToStaticMarkup(<ScrollArea><p>contenu</p></ScrollArea>);
  expect(html).not.toContain("!overflow-y-auto");
});
