import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitWorktreeSnapshot } from '@/lib/services/change-request-verification';

const execFileAsync = promisify(execFile);

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: process.cwd(),
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.trim();
}

/** Read current branch and uncommitted changed files (local dev only). */
export async function captureGitWorktreeSnapshot(): Promise<GitWorktreeSnapshot> {
  try {
    const inside = await git(['rev-parse', '--is-inside-work-tree']);
    if (inside !== 'true') {
      return {
        available: false,
        branch: '',
        filesChanged: [],
        diffStat: '',
        error: 'Not a git repository',
      };
    }

    let branch = '';
    try {
      branch = await git(['branch', '--show-current']);
    } catch {
      branch = '';
    }

    const unstaged = await git(['diff', '--name-only']).catch(() => '');
    const staged = await git(['diff', '--cached', '--name-only']).catch(() => '');
    const filesChanged = [...new Set([...unstaged.split('\n'), ...staged.split('\n')].filter(Boolean))];

    let diffStat = '';
    try {
      diffStat = await git(['diff', '--stat', 'HEAD']);
    } catch {
      diffStat = await git(['diff', '--stat']).catch(() => '');
    }

    return { available: true, branch, filesChanged, diffStat };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Git unavailable';
    return {
      available: false,
      branch: '',
      filesChanged: [],
      diffStat: '',
      error: message.includes('ENOENT') ? 'Git not installed on server' : message,
    };
  }
}
