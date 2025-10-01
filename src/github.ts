import { getOctokit } from '@actions/github';
import { PullRequest, FileChange } from './types';

export class GitHubClient {
  private octokit: ReturnType<typeof getOctokit>;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = getOctokit(token);
    this.owner = owner;
    this.repo = repo;
  }

  async getLastReleaseDate(): Promise<string> {
    try {
      const { data: releases } = await this.octokit.rest.repos.listReleases({
        owner: this.owner,
        repo: this.repo,
        per_page: 1
      });

      if (releases.length > 0) {
        return releases[0].created_at;
      }
    } catch (error) {
      console.log('No releases found, using 30 days ago as default');
    }

    // Default to 30 days ago if no releases found
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo.toISOString();
  }

  async collectPRs(since: string): Promise<PullRequest[]> {
    const sinceDate = new Date(since);

    // Skip search API entirely - it doesn't work for private repos
    // Use git commit analysis instead (like git-cliff does)
    console.log('Using git-based PR collection (avoids GitHub API limitations)');
    return this.collectPRsFromGit(sinceDate);
  }

  private async collectPRsFromGit(sinceDate: Date): Promise<PullRequest[]> {
    // Use git log to get commits since the date, then extract PR info from commit messages
    // This avoids GitHub API permission issues entirely
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    try {
      // Get git log since date with PR merge commits
      const gitCommand = `git log --since="${sinceDate.toISOString()}" --grep="Merge pull request" --oneline --format="%H|%s|%an|%ad" --date=iso`;
      const { stdout } = await execAsync(gitCommand);

      const prs: PullRequest[] = [];
      const lines = stdout.trim().split('\n').filter((line: string) => line.length > 0);

      for (const line of lines) {
        const [hash, message, author, date] = line.split('|');

        // Extract PR number from merge commit message
        const prMatch = message.match(/Merge pull request #(\d+)/);
        if (!prMatch) continue;

        const prNumber = parseInt(prMatch[1]);

        // Extract title from commit message
        const titleMatch = message.match(/Merge pull request #\d+ from [^/]+\/(.+)/);
        const title = titleMatch ? titleMatch[1].replace(/-/g, ' ') : message;

        prs.push({
          number: prNumber,
          title: title,
          body: null,
          labels: [],
          files: [],
          merge_strategy: 'merge' as const,
          author: author,
          merged_at: date,
          merge_commit_sha: hash
        });
      }

      console.log(`Found ${prs.length} merged PRs from git log`);
      return prs;
    } catch (error) {
      console.log('Git-based collection failed, falling back to API method');
      return this.collectPRsFallback(sinceDate);
    }
  }

  private async collectPRsFallback(sinceDate: Date): Promise<PullRequest[]> {
    // Fallback: List all PRs and filter locally
    const { data: allPrs } = await this.octokit.rest.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: 100
    });

    const prs: PullRequest[] = [];

    for (const pr of allPrs) {
      // Skip if not merged or merged before since date
      if (!pr.merged_at || new Date(pr.merged_at) < sinceDate) continue;

      // Get PR files
      const files = await this.getPRFiles(pr.number);

      // Detect merge strategy
      const mergeStrategy = await this.detectMergeStrategy(pr);

      prs.push({
        number: pr.number,
        title: pr.title,
        body: pr.body || null,
        labels: pr.labels?.map(label => typeof label === 'string' ? label : label.name).filter((name): name is string => name !== undefined) || [],
        files,
        merge_strategy: mergeStrategy,
        author: pr.user?.login || 'unknown',
        merged_at: pr.merged_at || '',
        merge_commit_sha: pr.merge_commit_sha || ''
      });
    }

    return prs;
  }

  async getPRFiles(prNumber: number): Promise<FileChange[]> {
    const { data: files } = await this.octokit.rest.pulls.listFiles({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber
    });

    return files.map(file => ({
      path: file.filename,
      status: file.status as 'added' | 'modified' | 'removed',
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch
    }));
  }

  private async detectMergeStrategy(pr: any): Promise<'squash' | 'rebase' | 'merge'> {
    try {
      if (!pr.merge_commit_sha) return 'squash';

      // Get the merge commit
      const { data: mergeCommit } = await this.octokit.rest.git.getCommit({
        owner: this.owner,
        repo: this.repo,
        commit_sha: pr.merge_commit_sha
      });

      // Squash: Single parent, commit message often contains PR title
      if (mergeCommit.parents.length === 1) {
        if (mergeCommit.message.includes(pr.title) || mergeCommit.message.includes(`#${pr.number}`)) {
          return 'squash';
        }
        return 'rebase';
      }

      // Merge: Two parents (main branch + feature branch)
      if (mergeCommit.parents.length === 2) {
        return 'merge';
      }

      // Default to squash for safety
      return 'squash';
    } catch (error) {
      console.log(`Could not detect merge strategy for PR #${pr.number}, defaulting to squash`);
      return 'squash';
    }
  }

  async createOrUpdateChangelog(content: string): Promise<void> {
    const path = 'CHANGELOG.md';

    try {
      // Try to get existing file
      const { data: existingFile } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path
      });

      // Update existing file
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message: '🤖 Update CHANGELOG.md',
        content: Buffer.from(content).toString('base64'),
        sha: Array.isArray(existingFile) ? existingFile[0].sha : existingFile.sha
      });
    } catch (error) {
      // File doesn't exist, create new one
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message: '🤖 Create CHANGELOG.md',
        content: Buffer.from(content).toString('base64')
      });
    }
  }
}