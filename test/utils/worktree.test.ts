import { assertEquals } from "@std/assert"
import {
  formatStaleWorktreeWarning,
  type StaleWorktreeInfo,
} from "../../src/utils/worktree.ts"

Deno.test("formatStaleWorktreeWarning - empty array returns empty string", () => {
  const result = formatStaleWorktreeWarning([])
  assertEquals(result, "")
})

Deno.test("formatStaleWorktreeWarning - single stale worktree", () => {
  Deno.env.set("NO_COLOR", "1")
  const stale: StaleWorktreeInfo[] = [
    {
      path: "/home/user/project/.worktrees/ed/cli-123-fix-bug",
      relativePath: ".worktrees/ed/cli-123-fix-bug",
      lastCommitDate: new Date("2026-04-01T00:00:00Z"),
      daysSinceLastCommit: 23,
    },
  ]
  const result = formatStaleWorktreeWarning(stale)
  assertEquals(result.includes("Stale worktrees detected:"), true)
  assertEquals(result.includes(".worktrees/ed/cli-123-fix-bug"), true)
  assertEquals(result.includes("last commit 23 days ago"), true)
  assertEquals(result.includes("git worktree remove"), true)
  Deno.env.delete("NO_COLOR")
})

Deno.test("formatStaleWorktreeWarning - multiple stale worktrees", () => {
  Deno.env.set("NO_COLOR", "1")
  const stale: StaleWorktreeInfo[] = [
    {
      path: "/home/user/project/.worktrees/ed/cli-123-fix-bug",
      relativePath: ".worktrees/ed/cli-123-fix-bug",
      lastCommitDate: new Date("2026-03-01T00:00:00Z"),
      daysSinceLastCommit: 45,
    },
    {
      path: "/home/user/project/.worktrees/ed/cli-456-add-feature",
      relativePath: ".worktrees/ed/cli-456-add-feature",
      lastCommitDate: new Date("2026-04-01T00:00:00Z"),
      daysSinceLastCommit: 23,
    },
  ]
  const result = formatStaleWorktreeWarning(stale)
  assertEquals(result.includes("cli-123-fix-bug"), true)
  assertEquals(result.includes("45 days ago"), true)
  assertEquals(result.includes("cli-456-add-feature"), true)
  assertEquals(result.includes("23 days ago"), true)
  Deno.env.delete("NO_COLOR")
})

Deno.test("formatStaleWorktreeWarning - singular day", () => {
  Deno.env.set("NO_COLOR", "1")
  const stale: StaleWorktreeInfo[] = [
    {
      path: "/home/user/project/.worktrees/branch-x",
      relativePath: ".worktrees/branch-x",
      lastCommitDate: new Date(),
      daysSinceLastCommit: 1,
    },
  ]
  const result = formatStaleWorktreeWarning(stale)
  assertEquals(result.includes("1 day ago"), true)
  assertEquals(result.includes("1 days ago"), false)
  Deno.env.delete("NO_COLOR")
})
