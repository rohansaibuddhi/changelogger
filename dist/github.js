"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubClient = void 0;
const github_1 = require("@actions/github");
class GitHubClient {
    constructor(token, owner, repo) {
        this.octokit = (0, github_1.getOctokit)(token);
        this.owner = owner;
        this.repo = repo;
    }
    async getLastReleaseDate() {
        try {
            const { data: releases } = await this.octokit.rest.repos.listReleases({
                owner: this.owner,
                repo: this.repo,
                per_page: 1
            });
            if (releases.length > 0) {
                return releases[0].created_at;
            }
        }
        catch (error) {
            console.log('No releases found, using 30 days ago as default');
        }
        // Default to 30 days ago if no releases found
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return thirtyDaysAgo.toISOString();
    }
    async collectPRs(since) {
        const sinceDate = new Date(since);
        try {
            // Try search API first (works for public repos)
            const { data: searchResults } = await this.octokit.rest.search.issuesAndPullRequests({
                q: `repo:${this.owner}/${this.repo} is:pr is:merged merged:>=${sinceDate.toISOString().split('T')[0]}`,
                sort: 'created',
                order: 'desc',
                per_page: 100
            });
            const prs = [];
            for (const item of searchResults.items) {
                if (!item.pull_request)
                    continue;
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
                    labels: item.labels?.map(label => typeof label === 'string' ? label : label.name).filter((name) => name !== undefined) || [],
                    files,
                    merge_strategy: mergeStrategy,
                    author: item.user?.login || 'unknown',
                    merged_at: pr.merged_at || '',
                    merge_commit_sha: pr.merge_commit_sha || ''
                });
            }
            return prs;
        }
        catch (error) {
            console.log('Search API failed, falling back to direct PR listing method');
            return this.collectPRsFallback(sinceDate);
        }
    }
    async collectPRsFallback(sinceDate) {
        // Fallback: List all PRs and filter locally
        const { data: allPrs } = await this.octokit.rest.pulls.list({
            owner: this.owner,
            repo: this.repo,
            state: 'closed',
            sort: 'updated',
            direction: 'desc',
            per_page: 100
        });
        const prs = [];
        for (const pr of allPrs) {
            // Skip if not merged or merged before since date
            if (!pr.merged_at || new Date(pr.merged_at) < sinceDate)
                continue;
            // Get PR files
            const files = await this.getPRFiles(pr.number);
            // Detect merge strategy
            const mergeStrategy = await this.detectMergeStrategy(pr);
            prs.push({
                number: pr.number,
                title: pr.title,
                body: pr.body || null,
                labels: pr.labels?.map(label => typeof label === 'string' ? label : label.name).filter((name) => name !== undefined) || [],
                files,
                merge_strategy: mergeStrategy,
                author: pr.user?.login || 'unknown',
                merged_at: pr.merged_at || '',
                merge_commit_sha: pr.merge_commit_sha || ''
            });
        }
        return prs;
    }
    async getPRFiles(prNumber) {
        const { data: files } = await this.octokit.rest.pulls.listFiles({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber
        });
        return files.map(file => ({
            path: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            patch: file.patch
        }));
    }
    async detectMergeStrategy(pr) {
        try {
            if (!pr.merge_commit_sha)
                return 'squash';
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
        }
        catch (error) {
            console.log(`Could not detect merge strategy for PR #${pr.number}, defaulting to squash`);
            return 'squash';
        }
    }
    async createOrUpdateChangelog(content) {
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
        }
        catch (error) {
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
exports.GitHubClient = GitHubClient;
//# sourceMappingURL=github.js.map