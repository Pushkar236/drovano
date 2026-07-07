/**
 * Outbound-email boundary. The identity module composes messages; sending
 * is an injected concern so tests capture, development prints, and
 * production wires a real provider (vendor decision deferred until
 * credentials exist — tracked in docs/prompts/prompt-02-brief.md).
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send: (message: MailMessage) => Promise<void>;
}

/**
 * Development mailer: writes messages to the provided sink (the API's
 * stdout in dev). Never configured in production — the env loader will
 * refuse a production boot without a real mailer once one exists.
 */
export function createDevMailer(write: (line: string) => void): Mailer {
  return {
    send: (message) => {
      write(
        `[mail] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}\n`,
      );
      return Promise.resolve();
    },
  };
}
