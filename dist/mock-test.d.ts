import { PullRequest } from './types';
declare const mockPRs: PullRequest[];
declare function runMockTests(): Promise<void>;
export { runMockTests, mockPRs };
