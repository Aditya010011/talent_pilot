/** Days before interview startDate to auto-send candidate reminder emails */
export const REMINDER_DAYS_BEFORE = 1;

/** Default template for new interviews */
export const DEFAULT_EMAIL_TEMPLATE = {
  subject: "You're invited to an interview: {{interview_title}}",
  body: `Hi {{candidate_name}},

You've been invited to participate in an interview:
{{interview_title}}

{{interview_description}}

To start the interview, click the link below:
{{invite_link}}

{{validity_period}}`,
  reminderSubject: "Reminder: Upcoming interview for {{interview_title}}",
  reminderBody: `Hi {{candidate_name}},

This is a reminder to complete your interview:
{{interview_title}}

{{interview_description}}

To start the interview, click the link below:
{{invite_link}}

{{validity_period}}`,
  logoUrl: null as string | null,
  replyTo: null as string | null,
};
