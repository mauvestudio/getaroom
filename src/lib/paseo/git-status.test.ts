import { expect, test } from "bun:test";
import { githubRemoteLabel, isGithubRemoteUrl } from "./git-status";

test("reconnaît les remotes GitHub HTTPS et SSH", () => {
  expect(isGithubRemoteUrl("https://github.com/mauve/app.git")).toBe(true);
  expect(isGithubRemoteUrl("git@github.com:mauve/app.git")).toBe(true);
  expect(isGithubRemoteUrl("ssh://git@github.com/mauve/app.git")).toBe(true);
});

test("ignore les dépôts sans remote GitHub", () => {
  expect(isGithubRemoteUrl(null)).toBe(false);
  expect(isGithubRemoteUrl("https://gitlab.com/mauve/app.git")).toBe(false);
  expect(isGithubRemoteUrl("https://github.com.evil.example/mauve/app.git")).toBe(false);
});

test("nomme le remote GitHub sans révéler ses identifiants", () => {
  expect(githubRemoteLabel("https://user:secret@github.com/org/repo.git")).toBe("org/repo");
  expect(githubRemoteLabel("git@github.com:org/repo.git")).toBe("org/repo");
  expect(githubRemoteLabel("https://gitlab.com/org/repo.git")).toBeNull();
});
