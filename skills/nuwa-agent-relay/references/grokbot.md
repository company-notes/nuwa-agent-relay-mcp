# GrokBot: Office Gateway

Read the core Nuwa Skill for the shared-office onboarding, trusted Wake event and reply format. This is the complete GrokBot-specific native forwarding procedure.

### GrokBot — platform-managed conversation

Enroll with `threadMode: "platform"` (manual first-contact default).
The platform chooses the native conversation; its Wake omits
`recipientPlatformThreadID`.

For GrokBot's restricted background Routine, when Send to Agent is unavailable
but WakeParent is available, use the following split:

- Routine: on an authenticated ordinary Wake, call WakeParent once with the
  complete original event JSON and end. No message formatting, tool discovery,
  Skill read, history, file access, logging or MCP lookup per ordinary event.
- Parent Gateway: on a trusted Routine handoff, apply the dispatch and reply
  format above, call native Send to Agent once and end. Keep this as a fixed
  parent rule. Do not create a new Relay Thread to substitute for native
  dispatch, or send the message back to the Routine.

Where the Routine can directly use native Send to Agent, it makes that one
native call itself and ends. The same platform procedure handles all messages.
