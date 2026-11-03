import * as z from 'zod/v4';
import { activeWorkId } from './settings.mjs';
import { readIdentity } from './storage.mjs';

const uuid = z.string().min(1).max(128).describe('Opaque UUID/ID returned by Nuwa Relay.');
const body = z.string().min(1).max(100_000);
const artifacts = z.array(z.url().refine((url) => url.startsWith('https://'),
  'Artifact links must use HTTPS.')).max(20).optional();
const workRecipient = z.string().min(1).max(255).describe(
  'Agent Address Work (e.g. org/host/work or @host/work).',
);

function result(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function problem(error) {
  // Do not leak OAuth access/refresh token details to an MCP client.
  const message = error instanceof Error ? error.message : 'Unknown Relay error.';

  return { isError: true, content: [{ type: 'text', text: message }] };
}

export function registerRelayTools(server, client) {
  function tool(name, description, inputSchema, fn) {
    server.registerTool(name, {
      description,
      inputSchema,
    }, async (args) => {
      try {
        return result(await fn(args));
      } catch (error) {
        return problem(error);
      }
    });
  }

  tool('relay_identity',
    'Show the Agent Address OAuth Organization and selected active Work identity. Read-only.',
    z.object({}),
    async () => {
      const identity = await client.identityStatus(activeWorkId(await readIdentity()));

      if (!identity?.work?.id || !identity?.organization?.id) {
        throw new Error('Selected Work is not active or not owned by the signed-in account.');
      }

      return {
        organization: identity.organization,
        work: identity.work,
        host: identity.hosts?.find((h) => h.id === identity.work?.parentAddressId),

      };
    });

  tool('relay_inbox',
    'List messages addressed to this Work. This is the Relay D1 inbox; not proof of external email arrival.',
    z.object({}),
    () => client.relay('/v1/inbox'));

  tool('relay_host_inbox',
    'List unaccepted Host handoffs for this Work’s Host. Read-only.',
    z.object({}),
    () => client.relay('/v1/host-inbox'));

  tool('relay_get_message',
    'Fetch one message body using participating Work OAuth authorization. Read-only; does not mark read.',
    z.object({ messageId: uuid }),
    ({ messageId }) => client.relay('/v1/messages/' + encodeURIComponent(messageId)));

  tool('relay_thread_history',
    'Fetch complete Relay D1 message history for a Thread this Work participates in. Read-only.',
    z.object({ threadId: uuid }),
    ({ threadId }) => client.relay('/v1/threads/' + encodeURIComponent(threadId)));

  tool('relay_send_message',
    'Send a new Agent-to-Agent message through the Relay API and MailTrigger. External side effect; requires a Work recipient.',
    z.object({
      to: workRecipient,
      body,
      subject: z.string().min(1).max(255).optional(),
      artifactLinks: artifacts,
    }),
    (input) => client.relay('/v1/messages', {
      method: 'POST',
      expected: [201],
      body: input,
    }));

  tool('relay_send_handoff',
    'Send a Host-level handoff. External side effect; recipient must be a Host address (org/host or @host).',
    z.object({
      to: z.string().min(1).max(255),
      subject: z.string().min(1).max(255),
      body,
      artifactLinks: artifacts,
    }),
    (input) => client.relay('/v1/handoffs', {
      method: 'POST',
      expected: [201],
      body: input,
    }));

  tool('relay_reply_thread',
    'Send a reply in an existing Thread. External side effect and MailTrigger send.',
    z.object({
      threadId: uuid,
      body,
      subject: z.string().max(255).optional(),
      artifactLinks: artifacts,
    }),
    ({ threadId, ...reply }) => client.relay(
      '/v1/threads/' + encodeURIComponent(threadId) + '/messages',
      { method: 'POST', expected: [201], body: reply },
    ));

  tool('relay_accept_handoff',
    'Accept an unclaimed Host handoff as this Work identity; changes ownership. External side effect.',
    z.object({ messageId: uuid }),
    ({ messageId }) => client.relay(
      '/v1/handoffs/' + encodeURIComponent(messageId) + '/accept',
      { method: 'POST', expected: [201] },
    ));

  tool('relay_reply_handoff',
    'Reply to a Host handoff as the accepting Work. External side effect and MailTrigger send.',
    z.object({ messageId: uuid, body, artifactLinks: artifacts }),
    ({ messageId, ...reply }) => client.relay(
      '/v1/handoffs/' + encodeURIComponent(messageId) + '/reply',
      { method: 'POST', expected: [201], body: reply },
    ));

  tool('relay_receipt',
    'Show MailTrigger submission status, independently confirmed arrival and explicit recipient read receipts. Optional archive refresh queries MailTrigger.',
    z.object({ messageId: uuid, refreshArchive: z.boolean().optional() }),
    ({ messageId, refreshArchive }) => client.relay(
      '/v1/messages/' + encodeURIComponent(messageId) + '/receipt', {
        query: refreshArchive ? { refresh: 'archive' } : {},
      },
    ));

  tool('relay_acknowledge_read',
    'Explicitly mark a received message as read by this receiving Work (not sender); durable side effect.',
    z.object({ messageId: uuid }),
    ({ messageId }) => client.relay(
      '/v1/messages/' + encodeURIComponent(messageId) + '/read',
      { method: 'POST', expected: [201] },
    ));

  tool('relay_wake_events',
    'List wake notification delivery status for the selected Work. Read-only; HTTP 2xx does not prove AI model execution.',
    z.object({}),
    () => client.relay('/v1/wake-events'));

  tool('relay_provision_host_mailbox',
    'Create or recover a managed MailTrigger mailbox for the selected Host. External side effect; requires a verified MailTrigger domain.',
    z.object({}),
    () => client.relay('/v1/hosts/provision', { method: 'POST', expected: [201] }));
}
