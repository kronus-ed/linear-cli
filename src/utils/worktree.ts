import { join } from "@std/path"
import { Select } from "@cliffy/prompt"
import { bold, gray, yellow } from "@std/fmt/colors"
import { CliError } from "./errors.ts"
import { getOption } from "../config.ts"

const WORKTREES_DIR = ".worktrees"

export interface StaleWorktreeInfo {
  path: string
  relativePath: string
  lastCommitDate: Date
  daysSinceLastCommit: number
}

/**
 * Returns the absolute path to the git repository root.
 */
export async function getGitRootPath(): Promise<string> {
  const process = new Deno.Command("git", {
    args: ["rev-parse", "--show-toplevel"],
    stderr: "piped",
  })
  const { success, stdout, stderr } = await process.output()

  if (!success) {
    const errorMsg = new TextDecoder().decode(stderr).trim()
    throw new CliError(`Failed to get repository root: ${errorMsg}`)
  }

  return new TextDecoder().decode(stdout).trim()
}

/**
 * Creates a git worktree in .worktrees/<branchName> with a new branch.
 * Returns the absolute path to the created worktree.
 */
export async function createWorktree(
  branchName: string,
  sourceRef?: string,
): Promise<string> {
  const gitRoot = await getGitRootPath()
  const worktreePath = join(gitRoot, WORKTREES_DIR, branchName)
  const relativeWorktreePath = join(WORKTREES_DIR, branchName)

  let finalWorktreePath: string

  // Check if branch already exists
  const branchCheck = new Deno.Command("git", {
    args: ["rev-parse", "--verify", branchName],
    stderr: "piped",
  })
  const branchResult = await branchCheck.output()

  if (branchResult.success) {
    // Branch exists — check if there's already a worktree for it
    const existingWorktree = await findWorktreeForBranch(branchName)
    if (existingWorktree) {
      const relExisting = existingWorktree.startsWith(gitRoot)
        ? existingWorktree.slice(gitRoot.length + 1)
        : existingWorktree
      console.log(`✓ Open ${relExisting} to work on this issue`)
      finalWorktreePath = existingWorktree
    } else {
      const answer = await Select.prompt({
        message:
          `Branch ${branchName} already exists. What would you like to do?`,
        options: [
          { name: "Create worktree with existing branch", value: "existing" },
          {
            name: "Create worktree with new suffixed branch",
            value: "suffix",
          },
        ],
      })

      if (answer === "existing") {
        // Create worktree using existing branch (no -b flag)
        const process = new Deno.Command("git", {
          args: ["worktree", "add", worktreePath, branchName],
          stderr: "piped",
        })
        const { success, stderr } = await process.output()
        if (!success) {
          const errorMsg = new TextDecoder().decode(stderr).trim()
          throw new CliError(
            `Failed to create worktree for existing branch '${branchName}': ${errorMsg}`,
          )
        }
        console.log(`✓ Open ${relativeWorktreePath} to work on this issue`)
        finalWorktreePath = worktreePath
      } else {
        // Find next available suffix
        let suffix = 1
        let newBranch = `${branchName}-${suffix}`
        while (await branchExists(newBranch)) {
          suffix++
          newBranch = `${branchName}-${suffix}`
        }
        const suffixedPath = join(gitRoot, WORKTREES_DIR, newBranch)
        const relSuffixedPath = join(WORKTREES_DIR, newBranch)

        const args = ["worktree", "add", "-b", newBranch, suffixedPath]
        if (sourceRef) args.push(sourceRef)

        const process = new Deno.Command("git", {
          args,
          stderr: "piped",
        })
        const { success, stderr } = await process.output()
        if (!success) {
          const errorMsg = new TextDecoder().decode(stderr).trim()
          throw new CliError(
            `Failed to create worktree '${suffixedPath}': ${errorMsg}`,
          )
        }
        console.log(`✓ Open ${relSuffixedPath} to work on this issue`)
        finalWorktreePath = suffixedPath
      }
    }
  } else {
    // Branch doesn't exist — create worktree with new branch
    const args = ["worktree", "add", "-b", branchName, worktreePath]
    if (sourceRef) args.push(sourceRef)

    const process = new Deno.Command("git", {
      args,
      stderr: "piped",
    })
    const { success, stderr } = await process.output()
    if (!success) {
      const errorMsg = new TextDecoder().decode(stderr).trim()
      throw new CliError(
        `Failed to create worktree '${worktreePath}': ${errorMsg}`,
      )
    }
    console.log(`✓ Open ${relativeWorktreePath} to work on this issue`)
    finalWorktreePath = worktreePath
  }

  // Offer to open the worktree in VSCode
  if (Deno.stdout.isTerminal()) {
    const openInVscode = await Select.prompt({
      message: "Open worktree in VSCode?",
      options: [
        { name: "No", value: "no" },
        { name: "Yes", value: "yes" },
      ],
      default: "no",
    })

    if (openInVscode === "yes") {
      const process = new Deno.Command("code", {
        args: [finalWorktreePath],
        stderr: "piped",
      })
      const { success, stderr } = await process.output()
      if (!success) {
        const errorMsg = new TextDecoder().decode(stderr).trim()
        console.error(`Failed to open VSCode: ${errorMsg}`)
      } else {
        console.log(`✓ Opened worktree in VSCode`)
      }
    }
  }

  return finalWorktreePath
}

async function branchExists(branch: string): Promise<boolean> {
  try {
    const process = new Deno.Command("git", {
      args: ["rev-parse", "--verify", branch],
      stderr: "piped",
    })
    const { success } = await process.output()
    return success
  } catch {
    return false
  }
}

/**
 * Finds an existing worktree for a given branch name.
 * Returns the worktree path if found, null otherwise.
 */
async function findWorktreeForBranch(
  branchName: string,
): Promise<string | null> {
  const process = new Deno.Command("git", {
    args: ["worktree", "list", "--porcelain"],
    stderr: "piped",
  })
  const { success, stdout } = await process.output()
  if (!success) return null

  const output = new TextDecoder().decode(stdout)
  const entries = output.split("\n\n")
  for (const entry of entries) {
    const lines = entry.trim().split("\n")
    let worktreePath: string | null = null
    let branch: string | null = null
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length)
      }
      if (line.startsWith("branch ")) {
        // branch refs/heads/my-branch
        branch = line.slice("branch refs/heads/".length)
      }
    }
    if (branch === branchName && worktreePath) {
      return worktreePath
    }
  }
  return null
}

/**
 * Returns worktrees in .worktrees/ that haven't had a commit in more than
 * `staleDays` days.
 */
export async function getStaleWorktrees(
  staleDays: number,
): Promise<StaleWorktreeInfo[]> {
  let gitRoot: string
  try {
    gitRoot = await getGitRootPath()
  } catch {
    return []
  }

  const worktreesDir = join(gitRoot, WORKTREES_DIR)

  // Check if .worktrees/ directory exists
  try {
    const stat = await Deno.stat(worktreesDir)
    if (!stat.isDirectory) return []
  } catch {
    return []
  }

  const staleWorktrees: StaleWorktreeInfo[] = []
  const now = new Date()
  const thresholdMs = staleDays * 24 * 60 * 60 * 1000

  for await (const entry of Deno.readDir(worktreesDir)) {
    if (!entry.isDirectory) continue

    const wtPath = join(worktreesDir, entry.name)
    const relativePath = join(WORKTREES_DIR, entry.name)

    try {
      // Get the last commit date in this worktree
      const process = new Deno.Command("git", {
        args: ["log", "-1", "--format=%ci", "HEAD"],
        cwd: wtPath,
        stderr: "piped",
      })
      const { success, stdout } = await process.output()
      if (!success) continue

      const dateStr = new TextDecoder().decode(stdout).trim()
      if (!dateStr) continue

      const lastCommitDate = new Date(dateStr)
      const ageMs = now.getTime() - lastCommitDate.getTime()

      if (ageMs > thresholdMs) {
        staleWorktrees.push({
          path: wtPath,
          relativePath,
          lastCommitDate,
          daysSinceLastCommit: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
        })
      }
    } catch {
      // Skip worktrees we can't inspect
      continue
    }
  }

  // Sort by staleness (oldest first)
  staleWorktrees.sort((a, b) =>
    a.lastCommitDate.getTime() - b.lastCommitDate.getTime()
  )

  return staleWorktrees
}

/**
 * Formats a warning message about stale worktrees.
 */
export function formatStaleWorktreeWarning(
  stale: StaleWorktreeInfo[],
): string {
  if (stale.length === 0) return ""

  const lines: string[] = []
  lines.push("")
  lines.push(yellow(bold("⚠ Stale worktrees detected:")))
  for (const wt of stale) {
    const daysText = wt.daysSinceLastCommit === 1
      ? "1 day ago"
      : `${wt.daysSinceLastCommit} days ago`
    lines.push(
      yellow(`  ${wt.relativePath}`) + gray(` — last commit ${daysText}`),
    )
  }
  lines.push(gray(`  Remove with: git worktree remove <path>`))
  return lines.join("\n")
}

/**
 * Checks for stale worktrees and prints a warning if any are found.
 */
export async function checkStaleWorktrees(): Promise<void> {
  const staleDays = getOption("worktree_stale_days") ?? 7
  const stale = await getStaleWorktrees(staleDays)
  if (stale.length > 0) {
    console.error(formatStaleWorktreeWarning(stale))
  }
}
