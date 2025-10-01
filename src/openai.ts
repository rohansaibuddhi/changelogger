import OpenAI from 'openai';
import { PullRequest, ChangelogEntry, OpenAIResponse } from './types';

export interface EnhancedOpenAIResponse extends OpenAIResponse {
  driftWarnings: string[];
  suggestions: string[];
  hasBreakingChanges: boolean;
}

export class OpenAIChangelogGenerator {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey
    });
  }

  async generateChangelogWithAnalysis(prs: PullRequest[]): Promise<EnhancedOpenAIResponse> {
    if (prs.length === 0) {
      return {
        changelog: '# Changelog\n\nNo changes found for this release.',
        entries: [],
        driftWarnings: [],
        suggestions: [],
        hasBreakingChanges: false
      };
    }

    const prompt = this.buildComprehensivePrompt(prs);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an expert technical writer and software architect. Analyze pull requests to:
1. Generate a professional changelog
2. Detect documentation drift (when docs might be outdated)
3. Identify breaking changes
4. Suggest documentation updates

Return a JSON response with the exact structure specified in the user prompt.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      const content = response.choices[0]?.message?.content || '';
      return this.parseEnhancedResponse(content, prs);

    } catch (error) {
      console.error('OpenAI API error:', error);
      // Enhanced fallback with drift detection
      return this.generateEnhancedFallback(prs);
    }
  }

  async generateChangelog(prs: PullRequest[]): Promise<OpenAIResponse> {
    if (prs.length === 0) {
      return {
        changelog: '# Changelog\n\nNo changes found for this release.',
        entries: []
      };
    }

    const prompt = this.buildPrompt(prs);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a technical writer creating changelogs. Generate clear, user-facing changelog entries that describe what changed and why it matters to users. Group changes by type and be concise but informative.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      });

      const content = response.choices[0]?.message?.content || '';
      const entries = this.parseChangelogEntries(content, prs);

      return {
        changelog: this.formatChangelog(content),
        entries
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      // Fallback to basic changelog
      return this.generateFallbackChangelog(prs);
    }
  }

  private buildPrompt(prs: PullRequest[]): string {
    const prSummaries = prs.map(pr => {
      const fileTypes = this.categorizeFiles(pr.files);
      const mergeInfo = pr.merge_strategy === 'rebase' ? ' (rebased)' :
                       pr.merge_strategy === 'merge' ? ' (merged)' : '';

      return `
#${pr.number}: ${pr.title}${mergeInfo}
Author: @${pr.author}
Labels: ${pr.labels.join(', ') || 'none'}
Files changed: ${fileTypes.join(', ')}
Description: ${pr.body?.slice(0, 300) || 'No description provided'}
${pr.files.length > 0 ? `Key files: ${pr.files.slice(0, 3).map(f => f.path).join(', ')}` : ''}
`.trim();
    }).join('\n\n---\n\n');

    return `Generate a changelog from these ${prs.length} PRs. Follow this format:

## 🚀 Features
- User-facing description of new functionality (#PR)

## 🐛 Bug Fixes
- Clear description of what was fixed (#PR)

## 📚 Documentation
- Documentation updates and improvements (#PR)

## ⚠️ Breaking Changes
- Any breaking changes with migration notes (#PR)

## 🔧 Internal
- Internal changes, refactoring, dependency updates (#PR)

Guidelines:
- Focus on user impact, not implementation details
- Be concise but informative
- Group similar changes together
- Include PR numbers
- Skip sections with no changes

PRs to analyze:
${prSummaries}`;
  }

  private categorizeFiles(files: any[]): string[] {
    const categories = new Set<string>();

    for (const file of files) {
      if (file.path.match(/\.(md|txt|rst)$/i)) {
        categories.add('docs');
      } else if (file.path.match(/\.(test|spec)\./i)) {
        categories.add('tests');
      } else if (file.path.match(/\.(ts|js|tsx|jsx|py|go|rs|java|c|cpp)$/i)) {
        categories.add('code');
      } else if (file.path.match(/\.(yml|yaml|json|toml|xml)$/i)) {
        categories.add('config');
      } else if (file.path.includes('package') || file.path.includes('requirements') || file.path.includes('Cargo')) {
        categories.add('dependencies');
      } else {
        categories.add('misc');
      }
    }

    return Array.from(categories);
  }

  private parseChangelogEntries(content: string, prs: PullRequest[]): ChangelogEntry[] {
    const entries: ChangelogEntry[] = [];
    const lines = content.split('\n');
    let currentType: ChangelogEntry['type'] = 'internal';

    for (const line of lines) {
      if (line.includes('🚀') || line.toLowerCase().includes('features')) {
        currentType = 'feature';
      } else if (line.includes('🐛') || line.toLowerCase().includes('bug fixes')) {
        currentType = 'fix';
      } else if (line.includes('📚') || line.toLowerCase().includes('documentation')) {
        currentType = 'docs';
      } else if (line.includes('⚠️') || line.toLowerCase().includes('breaking')) {
        currentType = 'breaking';
      } else if (line.includes('🔧') || line.toLowerCase().includes('internal')) {
        currentType = 'internal';
      }

      // Extract PR number from line like "- Something (#123)"
      const prMatch = line.match(/\(#(\d+)\)/);
      if (prMatch && line.trim().startsWith('-')) {
        const prNumber = parseInt(prMatch[1]);
        const pr = prs.find(p => p.number === prNumber);

        if (pr) {
          entries.push({
            type: currentType,
            description: line.replace(/^-\s*/, '').trim(),
            pr_number: prNumber,
            author: pr.author
          });
        }
      }
    }

    return entries;
  }

  private formatChangelog(content: string): string {
    const today = new Date().toISOString().split('T')[0];
    return `# Changelog

## [Unreleased] - ${today}

${content}

---
*Generated by [Changelogger](https://github.com/rohansaibuddhi/changelogger) 🤖*
`;
  }

  private buildComprehensivePrompt(prs: PullRequest[]): string {
    const prSummaries = prs.map(pr => {
      const fileTypes = this.categorizeFiles(pr.files);
      const hasDocFiles = pr.files.some(f => f.path.match(/\.(md|txt|rst)$/i));
      const hasCodeFiles = pr.files.some(f => f.path.match(/\.(ts|js|tsx|jsx|py|go|rs|java|c|cpp)$/i));

      return `
PR #${pr.number}: ${pr.title}
Author: @${pr.author}
Merge Strategy: ${pr.merge_strategy}
Labels: ${pr.labels.join(', ') || 'none'}
Files: ${fileTypes.join(', ')}
Has Documentation: ${hasDocFiles ? 'Yes' : 'No'}
Has Code Changes: ${hasCodeFiles ? 'Yes' : 'No'}
Description: ${pr.body?.slice(0, 400) || 'No description'}
Key Changes: ${pr.files.slice(0, 5).map(f => `${f.path} (+${f.additions}/-${f.deletions})`).join(', ')}
`.trim();
    }).join('\n\n---\n\n');

    return `Analyze these ${prs.length} pull requests and provide a comprehensive response in JSON format:

REQUIRED JSON STRUCTURE:
{
  "changelog": "markdown formatted changelog with sections",
  "driftWarnings": ["array of specific documentation drift warnings"],
  "suggestions": ["array of actionable documentation update suggestions"],
  "hasBreakingChanges": boolean,
  "entries": [
    {
      "type": "feature|fix|docs|breaking|internal",
      "description": "human readable description",
      "pr_number": number,
      "author": "github username"
    }
  ]
}

CHANGELOG REQUIREMENTS:
- Use ## for sections: ## 🚀 Features, ## 🐛 Bug Fixes, ## 📚 Documentation, ## ⚠️ Breaking Changes, ## 🔧 Internal
- Each entry: "- Description (#PR) by @author"
- Focus on USER IMPACT, not implementation details
- Group related changes

DRIFT DETECTION REQUIREMENTS:
- Identify PRs with code changes but no documentation updates
- Flag API modifications without doc updates
- Detect breaking changes missing migration guides
- Check for new features without examples
- Spot dependency updates needing upgrade guides

ANALYSIS RULES:
- Breaking changes: Look for "BREAKING", major version changes, API removals
- Features: New functionality, enhancements, "add", "implement"
- Fixes: Bug fixes, "fix", "resolve", "patch"
- Docs: Documentation only changes
- Internal: Refactoring, tests, dependencies, build changes

Pull Requests to analyze:
${prSummaries}

RESPOND ONLY WITH VALID JSON. NO MARKDOWN FORMATTING AROUND THE JSON.`;
  }

  private parseEnhancedResponse(content: string, prs: PullRequest[]): EnhancedOpenAIResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        changelog: this.formatChangelog(parsed.changelog || ''),
        entries: parsed.entries || [],
        driftWarnings: parsed.driftWarnings || [],
        suggestions: parsed.suggestions || [],
        hasBreakingChanges: parsed.hasBreakingChanges || false
      };
    } catch (error) {
      console.warn('Failed to parse enhanced response, using fallback:', error);
      return this.generateEnhancedFallback(prs);
    }
  }

  private generateEnhancedFallback(prs: PullRequest[]): EnhancedOpenAIResponse {
    const fallback = this.generateFallbackChangelog(prs);
    const driftAnalysis = this.performHeuristicDriftDetection(prs);

    return {
      ...fallback,
      driftWarnings: driftAnalysis.warnings,
      suggestions: driftAnalysis.suggestions,
      hasBreakingChanges: driftAnalysis.hasBreakingChanges
    };
  }

  private performHeuristicDriftDetection(prs: PullRequest[]): {
    warnings: string[];
    suggestions: string[];
    hasBreakingChanges: boolean;
  } {
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let hasBreakingChanges = false;

    // Check for code changes without docs
    const codeChangePRs = prs.filter(pr =>
      pr.files.some(f => f.path.match(/\.(ts|js|tsx|jsx|py|go|rs|java|c|cpp)$/i))
    );
    const hasDocChanges = prs.some(pr =>
      pr.files.some(f => f.path.match(/\.(md|txt|rst)$/i))
    );

    if (codeChangePRs.length > 0 && !hasDocChanges) {
      warnings.push(`${codeChangePRs.length} PRs contain code changes but no documentation updates found`);
      suggestions.push('Consider updating README.md or documentation to reflect code changes');
    }

    // Check for API changes
    const apiChangePRs = prs.filter(pr =>
      pr.title.toLowerCase().includes('api') ||
      pr.body?.toLowerCase().includes('endpoint') ||
      pr.files.some(f => f.path.includes('api') || f.path.includes('router'))
    );

    if (apiChangePRs.length > 0) {
      warnings.push(`${apiChangePRs.length} PRs modify APIs - documentation may need updates`);
      suggestions.push('Update API documentation and examples to reflect changes');
    }

    // Check for breaking changes
    const breakingPRs = prs.filter(pr =>
      pr.title.toLowerCase().includes('breaking') ||
      pr.body?.toLowerCase().includes('breaking change') ||
      pr.labels.some(l => l.toLowerCase().includes('breaking'))
    );

    if (breakingPRs.length > 0) {
      hasBreakingChanges = true;
      warnings.push(`${breakingPRs.length} PRs contain breaking changes`);
      suggestions.push('Add migration guide and update version compatibility documentation');
    }

    // Check for new features without examples
    const featurePRs = prs.filter(pr =>
      pr.labels.some(l => l.toLowerCase().includes('feature')) ||
      pr.title.toLowerCase().includes('add') ||
      pr.title.toLowerCase().includes('implement')
    );

    if (featurePRs.length > 0) {
      const hasExamples = prs.some(pr =>
        pr.files.some(f => f.path.includes('example') || f.path.includes('demo'))
      );

      if (!hasExamples) {
        suggestions.push(`${featurePRs.length} new features added - consider adding usage examples`);
      }
    }

    return { warnings, suggestions, hasBreakingChanges };
  }

  private generateFallbackChangelog(prs: PullRequest[]): OpenAIResponse {
    const features = prs.filter(pr =>
      pr.labels.some(l => l.toLowerCase().includes('feature') || l.toLowerCase().includes('enhancement'))
    );
    const fixes = prs.filter(pr =>
      pr.labels.some(l => l.toLowerCase().includes('bug') || l.toLowerCase().includes('fix'))
    );
    const docs = prs.filter(pr =>
      pr.labels.some(l => l.toLowerCase().includes('doc')) ||
      pr.files.some(f => f.path.endsWith('.md'))
    );
    const others = prs.filter(pr =>
      !features.includes(pr) && !fixes.includes(pr) && !docs.includes(pr)
    );

    let changelog = '';

    if (features.length > 0) {
      changelog += '## 🚀 Features\n\n';
      features.forEach(pr => {
        changelog += `- ${pr.title} (#${pr.number})\n`;
      });
      changelog += '\n';
    }

    if (fixes.length > 0) {
      changelog += '## 🐛 Bug Fixes\n\n';
      fixes.forEach(pr => {
        changelog += `- ${pr.title} (#${pr.number})\n`;
      });
      changelog += '\n';
    }

    if (docs.length > 0) {
      changelog += '## 📚 Documentation\n\n';
      docs.forEach(pr => {
        changelog += `- ${pr.title} (#${pr.number})\n`;
      });
      changelog += '\n';
    }

    if (others.length > 0) {
      changelog += '## 🔧 Other Changes\n\n';
      others.forEach(pr => {
        changelog += `- ${pr.title} (#${pr.number})\n`;
      });
      changelog += '\n';
    }

    const entries: ChangelogEntry[] = [
      ...features.map(pr => ({ type: 'feature' as const, description: pr.title, pr_number: pr.number, author: pr.author })),
      ...fixes.map(pr => ({ type: 'fix' as const, description: pr.title, pr_number: pr.number, author: pr.author })),
      ...docs.map(pr => ({ type: 'docs' as const, description: pr.title, pr_number: pr.number, author: pr.author })),
      ...others.map(pr => ({ type: 'internal' as const, description: pr.title, pr_number: pr.number, author: pr.author }))
    ];

    return {
      changelog: this.formatChangelog(changelog),
      entries
    };
  }
}