import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('MessagesPage mounts the conversation:new refresh (#957 D1, invariant pass F-2)', () => {
  const source = readFileSync('src/pages/MessagesPage.tsx', 'utf8');
  it('imports and calls useConversationNewRefresh with the refetch trio', () => {
    expect(source).toMatch(/from '@\/hooks\/useConversationNewRefresh'/);
    expect(source).toMatch(/\buseConversationNewRefresh\(refreshOnNewMail\)/);
    const handler = source.match(
      /const refreshOnNewMail = useCallback\(\(\) => \{([\s\S]*?)\n {2}\}, \[/
    );
    expect(handler).not.toBeNull();
    const body = handler?.[1] ?? '';
    // The board re-reads at once; the thread list's first page holds arrivals behind the
    // "N new messages — show" bar (Messages list v4); every other case still re-reads.
    expect(body).toMatch(/bumpKanban\(\)/);
    expect(body).toMatch(
      /displayMode === 'threads' && messagesPagination\.page === 1[\s\S]*?newThreads\.probe\(\)/
    );
    expect(body).toMatch(/clearCache\(\);\s*void fetchMessages\(/);
  });
  it('CONTROL: the pattern does not match a file without the call', () => {
    expect(readFileSync('src/hooks/useConversationNewRefresh.ts', 'utf8')).not.toMatch(
      /\buseConversationNewRefresh\(refreshOnNewMail\)/
    );
  });
});
