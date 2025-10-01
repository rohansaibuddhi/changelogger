import { PullRequest, FileChange } from './types';
export declare class GitHubClient {
    private octokit;
    private owner;
    private repo;
    constructor(token: string, owner: string, repo: string);
    getLastReleaseDate(): Promise<string>;
    collectPRs(since: string): Promise<PullRequest[]>;
    private collectPRsFromGit;
    private collectPRsFallback;
    getPRFiles(prNumber: number): Promise<FileChange[]>;
    private detectMergeStrategy;
    createOrUpdateChangelog(content: string): Promise<void>;
}
