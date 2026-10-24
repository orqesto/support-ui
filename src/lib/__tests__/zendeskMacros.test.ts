import { describe, it, expect } from 'vitest';
import { parseZendeskMacros } from '../zendeskMacros';

const exportOf = (macros: unknown[], over: Record<string, unknown> = {}) =>
  JSON.stringify({ macros, next_page: null, count: macros.length, ...over });

const htmlMacro = (value: string, over: Record<string, unknown> = {}) => ({
  title: 'Hi',
  actions: [{ field: 'comment_value_html', value }],
  ...over,
});

const first = (value: string) => parseZendeskMacros(exportOf([htmlMacro(value)])).macros[0];

describe('parseZendeskMacros', () => {
  it('takes the HTML reply text and rewrites Zendesk fields to ours', () => {
    const { macros } = parseZendeskMacros(
      exportOf([
        htmlMacro(
          '<p>Hello {{ticket.requester.first_name}}, re #{{ ticket.id }}</p><p>{{current_user.name}} / {{ticket.requester.name}}</p>',
          { title: 'Order shipped', active: true, description: 'When the parcel has left.' }
        ),
      ])
    );
    expect(macros).toEqual([
      {
        title: 'Order shipped',
        active: true,
        description: 'When the parcel has left.',
        body: '<p>Hello {first_name}, re #{ticket_id}</p><p>{agent_name} / {customer_name|there}</p>',
        unmappedFields: [],
        ignoredActions: [],
      },
    ]);
  });

  it('reads the escaped \\{{…}} spelling Zendesk’s editor stores', () => {
    expect(first('<p>Hello \\{{ticket.requester.first_name}}</p>').body).toBe(
      '<p>Hello {first_name}</p>'
    );
  });

  it('leaves a field or Liquid tag with no equivalent as written and reports each once', () => {
    const macro = first(
      '<p>{{ticket.requester.last_name}} {{ticket.requester.last_name}} {{x | upcase}}</p><p>{% if ticket.status %}open{% endif %}</p>'
    );
    expect(macro.body).toBe(
      '<p>{{ticket.requester.last_name}} {{ticket.requester.last_name}} {{x | upcase}}</p><p>{% if ticket.status %}open{% endif %}</p>'
    );
    expect(macro.unmappedFields).toEqual([
      '{{ticket.requester.last_name}}',
      '{{x | upcase}}',
      '{% if ticket.status %}',
      '{% endif %}',
    ]);
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
    ).macros;
    expect(macro.body).toBe('<p>Hello &lt;there&gt;<br>line two</p><p>Second &amp; last</p>');
    expect(macro.active).toBe(false);
    expect(macro.ignoredActions).toEqual(['status', 'assignee_id']);
  });

  it('a macro with only actions, or only blank paragraphs, has no body', () => {
    const { macros } = parseZendeskMacros(
      exportOf([
        { title: 'Take it', actions: [{ field: 'assignee_id', value: 'current_user' }] },
        htmlMacro('<p>&nbsp;</p><p> </p>'),
      ])
    );
    expect(macros.map((macro) => macro.body)).toEqual(['', '']);
  });

  it('keeps only what the editor holds: no script, handlers, styles or images', () => {
    expect(
      first(
        '<p onclick="x()" style="color:#C72809">Hi <span style="color:red"><strong>there</strong></span></p><img src="https://example.com/x.png"><script>alert(1)</script>'
      ).body
    ).toBe('<p>Hi <strong>there</strong></p>');
  });

  it('a javascript: link loses its target', () => {
    expect(first('<p><a href="javascript:alert(1)">x</a></p>').body).not.toContain('javascript');
  });

  it('ignores text after the last brace, and accepts a single-macro response', () => {
    const single = JSON.stringify({ macro: { title: 'One', actions: [] } });
    expect(parseZendeskMacros(`${exportOf([{ title: 'A', actions: [] }])}§`).macros).toHaveLength(
      1
    );
    expect(parseZendeskMacros(single).macros[0].title).toBe('One');
  });

  it('says when the file is one page of a longer list', () => {
    expect(
      parseZendeskMacros(
        exportOf([htmlMacro('<p>x</p>')], {
          next_page: 'https://example.zendesk.test/api/v2/macros.json?page=2',
          count: 250,
        })
      )
    ).toMatchObject({ morePages: true, total: 250 });
    expect(parseZendeskMacros(exportOf([htmlMacro('<p>x</p>')]))).toMatchObject({
      morePages: false,
      total: 1,
    });
  });

  it('rejects a file that is not a macros export', () => {
    expect(() => parseZendeskMacros('not json')).toThrow('not valid JSON');
    expect(() => parseZendeskMacros('{"tickets": []}')).toThrow('No macros found');
  });
});
