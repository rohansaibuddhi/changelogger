"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InkeepDriftDetector = void 0;
const axios_1 = __importDefault(require("axios"));
class InkeepDriftDetector {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = axios_1.default.create({
            baseURL: 'https://api.inkeep.com/v1',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
    }
    async checkDocumentationDrift(prs, repoFullName) {
        try {
            // Filter PRs that have code changes (potential drift sources)
            const codeChangePRs = prs.filter(pr => pr.files.some(file => this.isCodeFile(file.path) && !this.isTestFile(file.path)));
            if (codeChangePRs.length === 0) {
                return {
                    warnings: [],
                    suggestions: [],
                    drift_detected: false
                };
            }
            // Prepare payload for Inkeep analysis
            const analysisPayload = {
                repository: repoFullName,
                changes: codeChangePRs.map(pr => ({
                    pr_number: pr.number,
                    title: pr.title,
                    description: pr.body || '',
                    files: pr.files
                        .filter(file => this.isCodeFile(file.path))
                        .map(file => ({
                        path: file.path,
                        status: file.status,
                        additions: file.additions,
                        deletions: file.deletions,
                        patch: file.patch?.slice(0, 2000) // Limit patch size
                    }))
                })),
                documentation_paths: this.getDocumentationPaths(prs),
                analysis_type: 'drift_detection'
            };
            console.log(`Analyzing ${codeChangePRs.length} PRs for documentation drift...`);
            // Send to Inkeep for analysis
            const response = await this.client.post('/analyze/drift', analysisPayload);
            return this.processInkeepResponse(response.data);
        }
        catch (error) {
            console.warn('Inkeep drift detection failed, continuing without drift analysis:', error);
            // Fallback: basic heuristic analysis
            return this.performHeuristicAnalysis(prs);
        }
    }
    isCodeFile(path) {
        const codeExtensions = [
            '.ts', '.tsx', '.js', '.jsx',
            '.py', '.go', '.rs', '.java',
            '.c', '.cpp', '.h', '.hpp',
            '.rb', '.php', '.scala', '.kt'
        ];
        return codeExtensions.some(ext => path.toLowerCase().endsWith(ext));
    }
    isTestFile(path) {
        return path.toLowerCase().includes('test') ||
            path.toLowerCase().includes('spec') ||
            path.includes('__tests__') ||
            path.includes('.test.') ||
            path.includes('.spec.');
    }
    isDocFile(path) {
        const docExtensions = ['.md', '.rst', '.txt'];
        const docPaths = ['docs/', 'doc/', 'README', 'CHANGELOG', 'CONTRIBUTING'];
        return docExtensions.some(ext => path.toLowerCase().endsWith(ext)) ||
            docPaths.some(docPath => path.toLowerCase().includes(docPath.toLowerCase()));
    }
    getDocumentationPaths(prs) {
        const docPaths = new Set();
        // Collect all documentation files from PRs
        prs.forEach(pr => {
            pr.files.forEach(file => {
                if (this.isDocFile(file.path)) {
                    docPaths.add(file.path);
                }
            });
        });
        // Add common documentation paths
        const commonPaths = [
            'README.md',
            'docs/',
            'documentation/',
            'CHANGELOG.md',
            'API.md',
            'CONTRIBUTING.md'
        ];
        commonPaths.forEach(path => docPaths.add(path));
        return Array.from(docPaths);
    }
    processInkeepResponse(data) {
        return {
            warnings: data.drift_warnings || [],
            suggestions: data.improvement_suggestions || [],
            drift_detected: (data.drift_warnings?.length || 0) > 0
        };
    }
    performHeuristicAnalysis(prs) {
        const warnings = [];
        const suggestions = [];
        // Check for common patterns that suggest documentation updates needed
        const codeChangePRs = prs.filter(pr => pr.files.some(file => this.isCodeFile(file.path)));
        const hasDocChanges = prs.some(pr => pr.files.some(file => this.isDocFile(file.path)));
        // Heuristic 1: Code changes without doc updates
        if (codeChangePRs.length > 0 && !hasDocChanges) {
            warnings.push(`${codeChangePRs.length} PRs contain code changes but no documentation updates were found`);
            suggestions.push('Consider updating README.md or documentation to reflect new features and changes');
        }
        // Heuristic 2: API changes
        const apiChangePRs = prs.filter(pr => pr.title.toLowerCase().includes('api') ||
            pr.body?.toLowerCase().includes('endpoint') ||
            pr.files.some(file => file.path.includes('api') || file.path.includes('router')));
        if (apiChangePRs.length > 0) {
            warnings.push(`${apiChangePRs.length} PRs appear to modify APIs - documentation may need updates`);
            suggestions.push('Update API documentation and examples to reflect API changes');
        }
        // Heuristic 3: Breaking changes
        const breakingChangePRs = prs.filter(pr => pr.title.toLowerCase().includes('breaking') ||
            pr.body?.toLowerCase().includes('breaking change') ||
            pr.labels.some(label => label.toLowerCase().includes('breaking')));
        if (breakingChangePRs.length > 0) {
            warnings.push(`${breakingChangePRs.length} PRs contain breaking changes - migration documentation required`);
            suggestions.push('Add migration guide and update version compatibility documentation');
        }
        // Heuristic 4: New features without examples
        const featurePRs = prs.filter(pr => pr.labels.some(label => label.toLowerCase().includes('feature')) ||
            pr.title.toLowerCase().includes('add') ||
            pr.title.toLowerCase().includes('implement'));
        if (featurePRs.length > 0) {
            const exampleChanges = prs.some(pr => pr.files.some(file => file.path.includes('example') || file.path.includes('demo')));
            if (!exampleChanges) {
                suggestions.push(`${featurePRs.length} new features added - consider adding usage examples`);
            }
        }
        return {
            warnings,
            suggestions,
            drift_detected: warnings.length > 0
        };
    }
    async validateApiKey() {
        try {
            await this.client.get('/health');
            return true;
        }
        catch (error) {
            console.warn('Inkeep API key validation failed');
            return false;
        }
    }
}
exports.InkeepDriftDetector = InkeepDriftDetector;
//# sourceMappingURL=inkeep.js.map