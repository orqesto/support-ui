import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Filter, Info, Lightbulb, Undo2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Kbd } from '@/components/ui/Kbd';
import { SearchInput } from '@/components/ui/SearchInput';
import type { KbQuestionChoice } from './kbMockTypes';
import { kbMockPairs } from './kbMockPairs';

/**
 * F0: static mock of the rebuilt Knowledge Base page, for the owner to react to. No API calls.
 * DEV only (`/knowledge-base/mock`); `?empty=1` shows "Nothing needs you", `?activity=open`
 * opens the Engine activity panel. F7 deletes this folder.
 */

type View = 'questions' | 'live' | 'activity';

const MORE_FILTERS = ['Status: Everything', 'Source: All', 'Language: All'] as const;

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

const EvidenceLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2 justify-between text-sm">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-medium text-right text-foreground">{value}</dd>
  </div>
);

const AnswerPanel = ({ letter, choice }: { letter: 'A' | 'B'; choice: KbQuestionChoice }) => {
  const ev = choice.evidence;
  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border bg-background min-w-0">
      <div className="flex gap-2 items-start">
        <Badge variant="secondary" className="shrink-0">
          {letter}
        </Badge>
        <p className="font-semibold break-words text-foreground">{choice.text}</p>
      </div>
      <dl className="space-y-1">
        <EvidenceLine label="Seen in" value={`${ev.threads} threads, ${ev.customers} customers`} />
        <EvidenceLine label="Countries" value={ev.countries.join(', ')} />
        <EvidenceLine label="Dates" value={`${fmt(ev.firstSeen)} to ${fmt(ev.lastSeen)}`} />
        <EvidenceLine label="Used in drafts" value={`${ev.usedInDraftsThisWeek} this week`} />
      </dl>
      <Button variant="outline" className="mt-auto w-full">
        <Kbd className="mr-2">{letter === 'A' ? '1' : '2'}</Kbd>
        Pick {letter}
      </Button>
    </div>
  );
};

const QuestionCard = ({ index }: { index: number }) => {
  const pair = kbMockPairs[index];
  const impact =
    pair.choices[0].evidence.usedInDraftsThisWeek + pair.choices[1].evidence.usedInDraftsThisWeek;
  return (
    <Card>
      <CardContent className="p-4 space-y-4 sm:p-6">
        <div className="flex flex-wrap gap-2 justify-between items-center text-xs text-muted-foreground">
          <span>
            Question {index + 1} of {kbMockPairs.length}
          </span>
          <span>Open for {pair.openDays} days</span>
        </div>
        <h2 className="font-display text-xl font-bold text-foreground break-words">
          {pair.question}
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AnswerPanel letter="A" choice={pair.choices[0]} />
          <AnswerPanel letter="B" choice={pair.choices[1]} />
        </div>
        <div className="space-y-1 text-sm">
          <p className="flex gap-2 items-start text-muted-foreground">
            <Info className="mt-0.5 w-4 h-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground">Engine already ruled out:</span>{' '}
              {pair.ruledOut.join('; ')}
            </span>
          </p>
          <p className="flex gap-2 items-start text-muted-foreground">
            <Lightbulb className="mt-0.5 w-4 h-4 shrink-0" />
            <span>
              Used in <span className="font-medium text-foreground">{impact} drafts</span> this week
            </span>
          </p>
        </div>
        <div className="pt-3 space-y-2 border-t">
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant="outline">
              <Kbd className="mr-2">3</Kbd>
              Depends on
            </Button>
            <input
              key={pair.id}
              type="text"
              defaultValue={pair.guess ?? ''}
              placeholder="what does it depend on?"
              aria-label="Depends on"
              className="w-full sm:w-auto sm:flex-1 px-3 h-10 text-sm rounded-md border min-w-[10rem] border-input bg-background"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant="outline">
              <Kbd className="mr-2">4</Kbd>
              Both wrong
            </Button>
            <input
              type="text"
              placeholder="the right answer (optional)"
              aria-label="Both wrong, the right answer"
              className="w-full sm:w-auto sm:flex-1 px-3 h-10 text-sm rounded-md border min-w-[10rem] border-input bg-background"
            />
          </div>
          <div className="flex flex-wrap gap-2 justify-between items-center pt-1">
            <Button variant="ghost">Skip / not sure</Button>
            <Button disabled>Save answer</Button>
          </div>
        </div>
        <p className="hidden text-xs text-muted-foreground md:block">
          <Kbd>j</Kbd> next <Kbd>k</Kbd> previous <Kbd>1</Kbd> <Kbd>2</Kbd> pick <Kbd>3</Kbd>{' '}
          depends <Kbd>4</Kbd> both wrong
        </p>
      </CardContent>
    </Card>
  );
};

const EmptyState = () => (
  <Card>
    <CardContent className="p-8 text-center space-y-2 sm:p-12">
      <h2 className="font-display text-xl font-bold text-foreground">Nothing needs you</h2>
      <p className="text-sm text-muted-foreground">
        The engine has no open questions. It will ask here when two answers disagree.
      </p>
      <p className="text-sm text-muted-foreground">Last question answered 2 days ago.</p>
    </CardContent>
  </Card>
);

// Spec D12: the findings strip counts what is wrong with the entries, each chip opens that list.
const FINDINGS = [
  { reason: 'raw_email', label: 'raw emails', n: 7 },
  { reason: 'awaiting_review', label: 'awaiting review', n: 12 },
  { reason: 'customer_specific', label: 'customer-specific', n: 5 },
  { reason: 'unclassified', label: 'could not classify', n: 3 },
  { reason: 'no_language', label: 'no clear language', n: 4 },
  { reason: 'detached', label: 'detached', n: 2 },
];

const ACTIVITY = [
  {
    when: 'Today 09:12',
    what: 'Merged two entries about invoice copies',
    why: 'Same answer in 6 threads',
  },
  {
    when: 'Yesterday',
    what: 'Removed a price list from 2025',
    why: 'Newer price list says otherwise',
  },
  {
    when: 'Yesterday',
    what: 'Changed "5 days" to "5 working days"',
    why: 'Matches the 4 latest replies',
  },
];

const RateTheEngine = () => (
  <div className="p-3 space-y-2 rounded-lg border bg-background">
    <div className="flex flex-wrap gap-2 justify-between items-center">
      <p className="font-semibold text-foreground">Rate the engine</p>
      <Button variant="outline" size="sm">
        Rate a sample
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">
      See what the engine would have answered, and say if it was right. Nothing is sent to a
      customer.
    </p>
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={20}
      aria-valuenow={14}
      aria-label="Ratings toward the gate"
      className="overflow-hidden h-2 rounded-full bg-secondary"
    >
      <div className="h-full bg-primary" style={{ width: '70%' }} />
    </div>
    <p className="text-xs text-muted-foreground">
      14 of 20 ratings so far, 93 % good. After 20 ratings at 90 % or better, you can switch this
      action to Automatic.
    </p>
  </div>
);

const ActivityPanel = ({
  open,
  onToggle,
  questions,
}: {
  open: boolean;
  onToggle: () => void;
  questions: number;
}) => (
  <Card>
    <CardContent className="p-4 space-y-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex flex-wrap gap-x-2 gap-y-1 items-center w-full text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0" />
        )}
        <span className="font-semibold text-foreground">Engine activity</span>
        <span className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto">
          Engine did 41 things this week, 0 undone, {questions} questions for you
        </span>
      </button>
      <div className="flex flex-wrap gap-2">
        {FINDINGS.map((finding) => (
          <a key={finding.reason} href={`/knowledge-base?finding=${finding.reason}`}>
            <Badge variant="secondary">
              {finding.n} {finding.label}
            </Badge>
          </a>
        ))}
      </div>
      {open && (
        <div className="pt-3 space-y-3 border-t">
          <ul className="space-y-2">
            {ACTIVITY.map((item) => (
              <li key={item.what} className="flex flex-wrap gap-x-3 gap-y-1 items-start text-sm">
                <span className="w-full shrink-0 text-muted-foreground sm:w-28">{item.when}</span>
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-foreground break-words">
                    <span className="font-medium">Engine</span>{' '}
                    {item.what.charAt(0).toLowerCase() + item.what.slice(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">Why: {item.why}</p>
                </div>
                <Button variant="ghost" size="sm">
                  <Undo2 className="mr-1 w-3 h-3" />
                  Undo
                </Button>
              </li>
            ))}
          </ul>
          <RateTheEngine />
        </div>
      )}
    </CardContent>
  </Card>
);

export const KbPageMock = () => {
  const [params] = useSearchParams();
  const empty = params.get('empty') === '1';
  const [moreOpen, setMoreOpen] = useState(params.get('more') === 'open');
  const [view, setView] = useState<View>('questions');
  const [activityOpen, setActivityOpen] = useState(params.get('activity') === 'open');
  const count = empty ? 0 : kbMockPairs.length;

  return (
    <div className="px-4 py-4 mx-auto space-y-4 w-full max-w-5xl">
      <PageHeader
        title={`Questions for you (${count})`}
        description="Where two answers disagree, the engine asks you. Everything else it does by itself."
      />
      <div className="flex flex-wrap gap-3 items-center">
        <SegmentedControl<View>
          ariaLabel="Knowledge base view"
          value={view}
          onChange={setView}
          segments={[
            { value: 'questions', label: 'Questions' },
            { value: 'live', label: 'Live answers' },
            { value: 'activity', label: 'Engine activity' },
          ]}
        />
        <div className="flex-1 min-w-[10rem]">
          <SearchInput value="" onChange={() => undefined} placeholder="Search questions" />
        </div>
        <Button variant="outline" size="sm">
          Team
          <ChevronDown className="ml-1 w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm">
          Type
          <ChevronDown className="ml-1 w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((isOpen) => !isOpen)}
        >
          <Filter className="mr-1 w-4 h-4" />
          More filters
        </Button>
      </div>
      {moreOpen && (
        <div className="flex flex-wrap gap-2" aria-label="More filters">
          {MORE_FILTERS.map((label) => (
            <Badge key={label} variant="secondary">
              {label}
            </Badge>
          ))}
          <Badge variant="secondary">Settings</Badge>
        </div>
      )}
      {empty ? <EmptyState /> : <QuestionCard index={0} />}
      <ActivityPanel
        open={activityOpen}
        onToggle={() => setActivityOpen((isOpen) => !isOpen)}
        questions={count}
      />
    </div>
  );
};
