/**
 * Reply templates + ticket drafts services over the REAL api-client (only the wire is fake):
 * version skew (404 ⇒ unavailable), defensive normalising, and the request shapes of build spec A3/A5.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok, routeAbsent, type WireHandler } from '@/test/apiTransport';
import { replyTemplatesService } from '@/services/replyTemplates.service';
import { ticketDraftsService } from '@/services/ticketDrafts.service';
import { ticketRepliesService } from '@/services/ticketReplies.service';

let handler: WireHandler = routeAbsent;
let wire: ReturnType<typeof installTransport>;
beforeEach(() => {
  handler = routeAbsent;
  wire = installTransport(apiClient, (request) => handler(request));
});
afterEach(() => wire.restore());

describe('replyTemplatesService', () => {
  it('an older backend (404) is "unavailable", not an error', async () => {
    expect(await replyTemplatesService.list('thread')).toEqual({ unavailable: true });
  });

  it('a 500 is an error, not "unavailable"', async () => {
    handler = () => ({ status: 500, data: { success: false, error: 'boom' } });
    await expect(replyTemplatesService.list('thread')).rejects.toBeTruthy();
  });

  it('asks for one box’s templates and normalises every row; canEdit fails closed', async () => {
    handler = () =>
      ok({
        templates: [
          {
            id: 1,
            name: 'Refund approved',
            body: '<p>Hi {first_name|there}</p>',
            use: 'thread',
            departmentId: 3,
            attachments: [
              { id: 7, filename: 'policy.pdf', contentType: 'application/pdf', size: 10 },
            ],
            updatedAt: '2026-10-09T10:00:00Z',
            canEdit: true,
          },
          { id: 2, name: 'Outage update', body: '<p>Fixed</p>', use: 'mystery' },
          { name: 'no id', body: 'x' },
        ],
      });
    const result = await replyTemplatesService.list('thread');
    expect(wire.calls('GET', '/api/reply-templates')[0].params).toEqual({ use: 'thread' });
    if (result.unavailable) throw new Error('expected templates');
    expect(result.templates.map((row) => row.id)).toEqual([1, 2]);
    expect(result.templates[0].attachments[0].filename).toBe('policy.pdf');
    expect(result.templates[1]).toMatchObject({
      use: 'both',
      departmentId: null,
      attachments: [],
      canEdit: false,
    });
  });

  it('create sends JSON without files and multipart with them', async () => {
    const template = { id: 5, name: 'Hello', body: '<p>Hi</p>', use: 'both', canEdit: true };
    handler = () => ({ status: 201, data: { success: true, data: template } });
    const input = { name: 'Hello', body: '<p>Hi</p>', use: 'both' as const, departmentId: null };
    expect((await replyTemplatesService.create(input)).id).toBe(5);
    expect(wire.calls('POST', '/api/reply-templates')[0].body).toEqual(input);

    await replyTemplatesService.create(input, [new File(['x'], 'a.txt')]);
    const form = wire.calls('POST', '/api/reply-templates')[1].body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('name')).toBe('Hello');
    expect(form.get('departmentId')).toBe('null');
    expect((form.get('attachments') as File).name).toBe('a.txt');
  });

  it('update sends removeAttachmentIds only when there are some', async () => {
    handler = () => ok({ template: { id: 5, name: 'Hello', body: '<p>Hi</p>' } });
    const input = { name: 'Hello', body: '<p>Hi</p>', use: 'thread' as const, departmentId: 2 };
    await replyTemplatesService.update(5, input);
    await replyTemplatesService.update(5, input, [7]);
    const calls = wire.calls('PUT', '/api/reply-templates/5');
    expect(calls[0].body).toEqual(input);
    expect(calls[1].body).toEqual({ ...input, removeAttachmentIds: [7] });
  });
});

describe('ticketDraftsService', () => {
  it('an older backend (404) is "unavailable"', async () => {
    expect(await ticketDraftsService.draftsOfTicket(4)).toEqual({ unavailable: true });
  });

  it('drops malformed drafts and reads created/refused', async () => {
    handler = (request) =>
      request.method === 'GET'
        ? ok({ drafts: [{ conversationId: 11, content: '<p>Hi Ada</p>' }, { content: 'x' }] })
        : ok({ created: [11], refused: [{ conversationId: 12, reason: 'no name' }] });
    const drafts = await ticketDraftsService.draftsOfTicket(4);
    if (drafts.unavailable) throw new Error('expected drafts');
    expect(drafts.drafts).toEqual([
      {
        conversationId: 11,
        content: '<p>Hi Ada</p>',
        baseContent: '<p>Hi Ada</p>',
        templateId: null,
        adapted: false,
        updatedAt: '',
      },
    ]);
    const made = await ticketDraftsService.create(4, { templateId: 3 }, [11, 12]);
    expect(wire.calls('POST', '/api/tickets/4/drafts')[0].body).toEqual({
      templateId: 3,
      conversationIds: [11, 12],
    });
    expect(made).toEqual({ created: [11], refused: [{ conversationId: 12, reason: 'no name' }] });
  });

  it('hasOwnText per delivery: read when sent, false from an older backend', async () => {
    handler = () =>
      ok({
        replies: [
          {
            id: 7,
            content: 'x',
            deliveries: [
              { conversationId: 11, outcome: 'sent', hasOwnText: true },
              { conversationId: 12, outcome: 'sent' },
            ],
          },
        ],
      });
    const result = await ticketRepliesService.repliesOfTicket(4);
    if (result.unavailable) throw new Error('expected replies');
    expect(result.replies[0].deliveries.map((row) => row.hasOwnText)).toEqual([true, false]);
  });

  it('Send reviewed posts fromDrafts with the threads, no content', async () => {
    handler = () => ok({ replyId: 9, queued: [11], skipped: [] });
    await ticketRepliesService.send(4, { fromDrafts: true }, [11], false);
    expect(wire.calls('POST', '/api/tickets/4/replies')[0].body).toEqual({
      fromDrafts: true,
      conversationIds: [11],
      resolve: false,
    });
  });
});
