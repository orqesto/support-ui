import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('MessagesPage mounts the conversation:new refresh (#957 D1, invariant pass F-2)', () => {
  const source = readFileSync('src/pages/MessagesPage.tsx', 'utf8');
  it('imports and calls useConversationNewRefresh with the refetch trio', () => {
    expect(source).toMatch(/from '@\/hooks\/useConversationNewRefresh'/);
    expect(source).toMatch(/\buseConversationNewRefresh\(refreshOnNewMail\)/);
    expect(source).toMatch(/const refreshOnNewMail = useCallback\(\(\) => \{\s*clearCache\(\);\s*void fetchMessages\(/);
  });
  it('CONTROL: the pattern does not match a file without the call', () => {
    expect(readFileSync('src/hooks/useConversationNewRefresh.ts', 'utf8')).not.toMatch(/\buseConversationNewRefresh\(refreshOnNewMail\)/);
  });
});
