import { describe, it, expect } from 'vitest';
import { parseZendeskMacros } from '../zendeskMacros';

const exportOf = (macros: unknown[]) =>
  JSON.stringify({ macros, next_page: null, count: macros.length });

describe('parseZendeskMacros', () => {
  it('takes the HTML reply text and rewrites Zendesk fields to ours', () => {
    const [macro] = parseZendeskMacros(
      exportOf([
        {
          title: 'Order shipped',
          active: true,
          description: 'When the parcel has left.',
          actions: [
            {
              field: 'comment_value_html',
              value:
                '<p>Hello {{ticket.requester.first_name}}, re #{{ ticket.id }}</p><p>{{current_user.name}} / {{ticket.requester.name}}</p>',
            },
          ],
        },
      ])
    );
    expect(macro).toEqual({
      title: 'Order shipped',
      active: true,
      description: 'When the parcel has left.',
      body: '<p>Hello {first_name}, re #{ticket_id}</p><p>{agent_name} / {customer_name|there}</p>',
      unmappedFields: [],
      ignoredActions: [],
    });
  });

  it('reads the escaped \\{{…}} spelling Zendesk’s editor stores', () => {
    const [macro] = parseZendeskMacros(
      exportOf([
        {
          title: 'Hi',
          actions: [
            {
              field: 'comment_value_html',
              value: '<p>Hello \\{{ticket.requester.first_name}}</p>',
            },
          ],
        },
      ])
    );
    expect(macro.body).toBe('<p>Hello {first_name}</p>');
  });

  it('leaves a field with no equivalent as written and reports it once', () => {
    const [macro] = parseZendeskMacros(
      exportOf([
        {
          title: 'Hi',
          actions: [
            {
              field: 'comment_value_html',
              value:
                '<p>{{ticket.requester.last_name}} {{ticket.requester.last_name}} {{x | upcase}}</p>',
            },
          ],
        },
      ])
    );
    expect(macro.body).toBe(
      '<p>{{ticket.requester.last_name}} {{ticket.requester.last_name}} {{x | upcase}}</p>'
    );
    expect(macro.unmappedFields).toEqual(['{{ticket.requester.last_name}}', '{{x | upcase}}']);
  });

  it('turns plain comment_value into escaped paragraphs and lists the other actions', () => {
    const [macro] = parseZendeskMacros(
      exportOf([
        {
          title: 'Not responding',
          active: false,
          actions: [
            { field: 'status', value: 'pending' },
            { field: 'comment_value', value: 'Hello <there>\nline two\n\nSecond & last' },
            { field: 'assignee_id', value: 'current_user' },
          ],
        },
      ])
    );
    expect(macro.body).toBe('<p>Hello &lt;there&gt;<br>line two</p><p>Second &amp; last</p>');
    expect(macro.active).toBe(false);
    expect(macro.ignoredActions).toEqual(['status', 'assignee_id']);
  });

  it('a macro with only actions has no body', () => {
    const [macro] = parseZendeskMacros(
      exportOf([{ title: 'Take it', actions: [{ field: 'assignee_id', value: 'current_user' }] }])
    );
    expect(macro.body).toBe('');
  });

  it('strips script from the HTML', () => {
    const [macro] = parseZendeskMacros(
      exportOf([
        {
          title: 'Hi',
          actions: [
            {
              field: 'comment_value_html',
              value: '<p onclick="x()">Hi</p><script>alert(1)</script>',
            },
          ],
        },
      ])
    );
    expect(macro.body).toBe('<p>Hi</p>');
  });

  it('ignores text after the last brace, and accepts a single-macro response', () => {
    const single = JSON.stringify({ macro: { title: 'One', actions: [] } });
    expect(parseZendeskMacros(`${exportOf([{ title: 'A', actions: [] }])}§`)).toHaveLength(1);
    expect(parseZendeskMacros(single)[0].title).toBe('One');
  });

  it('rejects a file that is not a macros export', () => {
    expect(() => parseZendeskMacros('not json')).toThrow('not valid JSON');
    expect(() => parseZendeskMacros('{"tickets": []}')).toThrow('No macros found');
  });
});
