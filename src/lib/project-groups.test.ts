import { expect, test } from "bun:test";
import { projectGroup, sortByGroup } from "./project-groups";

test("univers d'après le chemin", () => {
  expect(projectGroup("/home/example/Dev/Mauve/sample-app")).toBe("mauve");
  expect(projectGroup("/home/example/Dev/Perso/music-app")).toBe("perso");
  expect(projectGroup("/home/example/Dev/Mauve-old/x")).toBe("autres");
  expect(projectGroup("/agents/todo")).toBe("autres");
  expect(projectGroup(undefined)).toBe("autres");
});

test("tri stable par univers", () => {
  const items = [
    { n: "a", p: "/u/Dev/Perso/a" }, { n: "b", p: "/x/b" }, { n: "c", p: "/u/Dev/Mauve/c" }, { n: "d", p: "/u/Dev/Perso/d" },
  ];
  expect(sortByGroup(items, (i) => i.p).map((i) => i.n)).toEqual(["c", "a", "d", "b"]);
});
