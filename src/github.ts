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
    const sinceDate = new Date(since).toISOString().split('T')[0];

    // Search for merged PRs since the given date
    const { data: searchResults } = await this.octokit.rest.search.issuesAndPullRequests({
      q: `repo:${this.owner}/${this.repo} is:pr is:merged merged:>=${sinceDate}`,
      sort: 'created',
      order: 'desc',
      per_page: 100
    });

    const prs: PullRequest[] = [];

    for (const item of searchResults.items) {
      if (!item.pull_request) continue;

      // Get detailed PR information
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: item.number
      });

      // Get PR files
      const files = await this.getPRFiles(item.number);

      // Detect merge strategy
      const mergeStrategy = await this.detectMergeStrategy(pr);

      prs.push({
        number: item.number,
        title: item.title,
        body: item.body || null,
        labels: item.labels?.map(label => typeof label === 'string' ? label : label.name).filter((name): name is string => name !== undefined) || [],
        files,
        merge_strategy: mergeStrategy,
        author: item.user?.login || 'unknown',
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