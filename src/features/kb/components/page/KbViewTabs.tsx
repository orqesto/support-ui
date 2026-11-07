import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { KB_PAGE_VIEW_LABEL, type KbPageView } from './kbPageView';

/**
 * The Knowledge Base page's three views. `openQuestions` (null: not known) is shown on the
 * Questions tab. Without Manage-KB rights only Live answers exists, so no tabs are drawn.
 */
export const KbViewTabs = ({
  value,
  onChange,
  openQuestions,
}: {
  value: KbPageView;
  onChange: (next: KbPageView) => void;
  openQuestions: number | null;
}) => (
  <div data-kb-filter="view">
    <SegmentedControl<KbPageView>
      ariaLabel="Knowledge base view"
      size="md"
      value={value}
      onChange={onChange}
      segments={[
        {
          value: 'questions',
          label:
            openQuestions === null
              ? KB_PAGE_VIEW_LABEL.questions
              : `${KB_PAGE_VIEW_LABEL.questions} (${openQuestions})`,
          title: 'Where two answers disagree, the engine asks you',
        },
        {
          value: 'live',
          label: KB_PAGE_VIEW_LABEL.live,
          title: 'Every entry in the knowledge base',
        },
        {
          value: 'activity',
          label: KB_PAGE_VIEW_LABEL.activity,
          title: 'What the engine did by itself, and what it found',
        },
      ]}
    />
  </div>
);
