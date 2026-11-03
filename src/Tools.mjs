import * as z from 'zod/v4';

const workId = z.string().min(1).max(128).describe('Immutable Work UUID from Agent Address.');
const opaqueId = z.string().min(1).max(128);
const messageBody = z.string().min(1).max(100000);
const artifacts = z.array(z.url().refine((value) => value.startsWith('https:'))).max(20).optional();
const recipient = z.string().min(1).max(255);
const work = { workAddressId: workId };
const replyFields = { body: messageBody, artifactLinks: artifacts };

export class RelayTools {
  constructor(server, client) {
    this.server = server;
    this.client = client;
  }

  register(name, description, fields, handler) {
    this.server.registerTool(name, {
      description,
      inputSchema: z.object(fields),
    }, async (request) => {
      try {
        const data = await handler(request);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        // Upstream error messages are normalized by HTTPClient; do not echo HTTP bodies or credentials.
        return {
          isError: true,
          content: [{ type: 'text', text: error instanceof Error ? error.message : 'Unexpected MCP error.' }],
        };
      }
    });
  }

  address(path, options) {
    return this.client.request('address', path, options);
  }

  relay(workAddressId, path, options) {
    return this.client.request('relay', path, { ...options, workAddressId });
  }

  registerAddress() {
    this.register('agentAddressGetStatus', 'Show your OAuth account, hosts and optionally a Work.', {
      workAddressId: workId.optional(),
    }, ({ workAddressId }) => this.address('/v1/account/status', { workAddressId }));

    this.register('agentAddressClaimWork', 'Name an Agent session; creates a Work and possibly its Host.', {
      organization: z.string().optional(), organizationDisplayName: z.string().optional(),
      host: z.string().optional(), handle: z.string().optional(), displayName: z.string().optional(),
    }, (body) => this.address('/v1/account/work', { method: 'POST', body }));

    this.register('agentAddressRenameWork', 'Rename a Work without changing its stable ID.', {
      workAddressId: workId, handle: z.string().min(1),
    }, ({ workAddressId, handle }) => this.address(
      '/v1/account/work/' + encodeURIComponent(workAddressId),
      { method: 'PATCH', body: { handle } },
    ));

    this.register('agentAddressReleaseWork', 'Release a Work name when the session is finished.', work,
      ({ workAddressId }) => this.address('/v1/account/work/' + encodeURIComponent(workAddressId),
        { method: 'DELETE' }));

    this.register('agentAddressResolve', 'Resolve a canonical Agent Address.', {
      address: recipient,
    }, ({ address }) => this.address('/v1/account/resolve', { query: { address } }));
  }

  registerMessages() {
    this.register('relay_identity', 'Confirm the OAuth account owns this Work.', work,
      ({ workAddressId }) => this.address('/v1/account/status', { workAddressId }));
    this.register('relay_inbox', 'List this Work D1 inbox; does not mark messages read.', work,
      ({ workAddressId }) => this.relay(workAddressId, '/v1/inbox'));
    this.register('relay_host_inbox', 'List unaccepted Host handoffs; no claim or read side effect.', work,
      ({ workAddressId }) => this.relay(workAddressId, '/v1/host-inbox'));
    this.register('relay_get_message', 'Get one authorized message without marking it read.',
      { ...work, messageId: opaqueId }, ({ workAddressId, messageId }) => this.relay(
        workAddressId, '/v1/messages/' + encodeURIComponent(messageId)));
    this.register('relay_thread_history', 'Get authorized thread messages.',
      { ...work, threadId: opaqueId }, ({ workAddressId, threadId }) => this.relay(
        workAddressId, '/v1/threads/' + encodeURIComponent(threadId)));
    this.register('relay_send_message', 'Send a Work-to-Work message (real MailTrigger side effect).',
      { ...work, to: recipient, ...replyFields, subject: z.string().min(1).max(255).optional() },
      ({ workAddressId, ...body }) => this.relay(workAddressId, '/v1/messages', { method: 'POST', body }));
    this.register('relay_send_handoff', 'Send a handoff to a Work or Host (real MailTrigger side effect).',
      { ...work, to: recipient, subject: z.string().min(1).max(255), ...replyFields },
      ({ workAddressId, ...body }) => this.relay(workAddressId, '/v1/handoffs', { method: 'POST', body }));
    this.register('relay_reply_thread', 'Send a message to an existing authorized Thread.',
      { ...work, threadId: opaqueId, ...replyFields, subject: z.string().max(255).optional() },
      ({ workAddressId, threadId, ...body }) => this.relay(
        workAddressId, '/v1/threads/' + encodeURIComponent(threadId) + '/messages',
        { method: 'POST', body }));
    this.register('relay_accept_handoff', 'Explicitly accept a Host handoff as this Work.',
      { ...work, messageId: opaqueId },
      ({ workAddressId, messageId }) => this.relay(
        workAddressId, '/v1/handoffs/' + encodeURIComponent(messageId) + '/accept', { method: 'POST' }));
    this.register('relay_reply_handoff', 'Reply to an accepted Host handoff.',
      { ...work, messageId: opaqueId, ...replyFields },
      ({ workAddressId, messageId, ...body }) => this.relay(
        workAddressId, '/v1/handoffs/' + encodeURIComponent(messageId) + '/reply',
        { method: 'POST', body }));
    this.register('relay_receipt', 'Read submitted, externally received and explicitly read states separately.',
      { ...work, messageId: opaqueId, refreshArchive: z.boolean().optional() },
      ({ workAddressId, messageId, refreshArchive }) => this.relay(
        workAddressId, '/v1/messages/' + encodeURIComponent(messageId) + '/receipt',
        { query: refreshArchive ? { refresh: 'archive' } : {} }));
    this.register('relay_acknowledge_read', 'Explicitly acknowledge receipt as the addressed Work.',
      { ...work, messageId: opaqueId },
      ({ workAddressId, messageId }) => this.relay(
        workAddressId, '/v1/messages/' + encodeURIComponent(messageId) + '/read', { method: 'POST' }));
    this.register('relay_wake_events', 'Read wake callback delivery status (not proof of agent execution).', work,
      ({ workAddressId }) => this.relay(workAddressId, '/v1/wake-events'));
    this.register('relay_provision_host_mailbox', 'Create or reuse a managed Host mailbox (side effect).', work,
      ({ workAddressId }) => this.relay(workAddressId, '/v1/hosts/provision', { method: 'POST' }));
  }

  registerManagement() {
    this.register('relay_list_aliases', 'List aliases registered by the selected Work.', work,
      ({ workAddressId }) => this.relay(workAddressId, '/v1/aliases'));
    this.register('relay_register_alias', 'Register a pending external alias (not verified).',
      { ...work, provider: z.string().min(1).max(32), externalId: recipient },
      ({ workAddressId, provider, externalId }) => this.relay(
        workAddressId, '/v1/aliases', { method: 'POST', body: { provider, externalId } }));
    this.register('relay_revoke_alias', 'Revoke an alias owned by this Work.',
      { ...work, aliasId: opaqueId }, ({ workAddressId, aliasId }) => this.relay(
        workAddressId, '/v1/aliases/' + encodeURIComponent(aliasId), { method: 'DELETE' }));
    this.register('relay_get_wake_subscription', 'Inspect the selected Work wake subscription.', work,
      ({ workAddressId }) => this.relay(workAddressId, '/v1/wake-subscription'));
    this.register('relay_set_wake_subscription',
      'Set an HTTPS wake callback; save the returned signing secret securely.',
      { ...work, callbackUrl: z.url().refine((value) => value.startsWith('https:')) },
      ({ workAddressId, callbackUrl }) => this.relay(
        workAddressId, '/v1/wake-subscription', { method: 'POST', body: { callbackUrl } }));
    this.register('relay_remove_wake_subscription', 'Disable wake notifications for this Work.', work,
      ({ workAddressId }) => this.relay(workAddressId, '/v1/wake-subscription',
        { method: 'DELETE' }));
  }

  install() {
    this.registerAddress();
    this.registerMessages();
    this.registerManagement();
  }
}
