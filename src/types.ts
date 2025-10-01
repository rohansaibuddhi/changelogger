export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  files: FileChange[];
  merge_strategy: 'squash' | 'rebase' | 'merge';
  author: string;
  merged_at: string;
  merge_commit_sha: string;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'removed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface ChangelogEntry {
  type: 'feature' | 'fix' | 'docs' | 'breaking' | 'internal';
  description: string;
  pr_number: number;
  author: string;
}

export interface ActionConfig {
  openai_api_key: string;
  merge_strategy: 'auto' | 'squash' | 'rebase' | 'merge';
  since?: string;
  github_token: string;
}

export interface OpenAIResponse {
  changelog: string;
  entries: ChangelogEntry[];
}