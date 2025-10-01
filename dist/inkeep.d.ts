import { PullRequest, InkeepDriftAnalysis } from './types';
export declare class InkeepDriftDetector {
    private client;
    private apiKey;
    constructor(apiKey: string);
    checkDocumentationDrift(prs: PullRequest[], repoFullName: string): Promise<InkeepDriftAnalysis>;
    private isCodeFile;
    private isTestFile;
    private isDocFile;
    private getDocumentationPaths;
    private processInkeepResponse;
    private performHeuristicAnalysis;
    validateApiKey(): Promise<boolean>;
}
