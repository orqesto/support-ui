import { LinkifiedText } from '@/lib/linkify';

type FormattedKBContentProps = {
  content: string;
};

export const FormattedKBContent = ({ content }: FormattedKBContentProps) => {
  // Split content into sections (Question/Answer)
  const formatContent = (text: string) => {
    const sections: { type: 'question' | 'answer' | 'text'; content: string }[] = [];

    // Split by Question: and Answer: patterns
    const questionMatch = text.match(/Question:\s*(.*?)(?=Answer:|$)/is);
    const answerMatch = text.match(/Answer:\s*(.*?)$/is);

    if (questionMatch) {
      sections.push({ type: 'question', content: questionMatch[1].trim() });
    }

    if (answerMatch) {
      sections.push({ type: 'answer', content: answerMatch[1].trim() });
    }

    // If no Q&A structure detected, treat as plain text
    if (sections.length === 0) {
      sections.push({ type: 'text', content: text });
    }

    return sections;
  };

  const sections = formatContent(content);

  return (
    <div className="space-y-6">
      {sections.map((section, index) => {
        const key = `${section.type}-${index}-${section.content.substring(0, 20)}`;

        if (section.type === 'question') {
          return (
            <div key={key} className="space-y-2">
              <div className="flex gap-2 items-start">
                <div className="flex-shrink-0 px-2 py-1 text-xs font-semibold uppercase rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  Question
                </div>
              </div>
              <div className="pl-4 text-base leading-relaxed border-l-2 border-blue-500 dark:border-blue-400">
                <LinkifiedText>{section.content}</LinkifiedText>
              </div>
            </div>
          );
        }

        if (section.type === 'answer') {
          return (
            <div key={key} className="space-y-2">
              <div className="flex gap-2 items-start">
                <div className="flex-shrink-0 px-2 py-1 text-xs font-semibold uppercase rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  Answer
                </div>
              </div>
              <div className="pl-4 text-base leading-relaxed border-l-2 border-green-500 dark:border-green-400">
                <LinkifiedText>{section.content}</LinkifiedText>
              </div>
            </div>
          );
        }

        // Plain text
        return (
          <div key={key} className="text-base leading-relaxed">
            <LinkifiedText>{section.content}</LinkifiedText>
          </div>
        );
      })}
    </div>
  );
};
