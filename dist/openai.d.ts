import { PullRequest, OpenAIResponse } from './types';
export interface EnhancedOpenAIResponse extends OpenAIResponse {
    driftWarnings: string[];
    suggestions: string[];
    hasBreakingChanges: boolean;
}
export declare class OpenAIChangelogGenerator {
    private openai;
    constructor(apiKey: string);
    generateChangelogWithAnalysis(prs: PullRequest[]): Promise<EnhancedOpenAIResponse>;
    generateChangelog(prs: PullRequest[]): Promise<OpenAIResponse>;
    private buildPrompt;
    private categorizeFiles;
    private parseChangelogEntries;
    private formatChangelog;
    private buildComprehensivePrompt;
    private parseEnhancedResponse;
    private generateEnhancedFallback;
    private performHeuristicDriftDetection;
    private generateFallbackChangelog;
}
