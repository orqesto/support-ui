# Odly — Platform Documentation

## What Is Odly?

Odly is an AI-powered inbox management and workflow platform. It connects all the channels your contacts reach you through — email, Telegram, Slack, and your website — into a single shared inbox, then uses AI to sort, prioritize, and route incoming messages to the right team automatically or with agent assistance.

The platform serves any department that handles inbound communication: Support, Sales, Billing, HR, and General teams each get their own workspace, rules, knowledge base, and routing — all within the same organization.

---

## Core Concepts

### Organizations

Everything in Odly lives inside an **Organization**. Each organization has its own users, settings, rules, knowledge base, and integrations — completely isolated from others. You can have one organization or many (for agencies or multi-brand setups).

### Departments

Within an organization, work is split into **Departments**: Support, Sales, Billing, General, and HR. Each department has its own inbox, categories, rules, and knowledge base entries. A user can belong to multiple departments with different roles in each.

### Messages vs Tickets

- **Messages** are raw incoming communications — emails, Telegram messages, Slack messages, or chat widget submissions. They land in the inbox as they arrive.
- **Tickets** are structured work items created from messages when a case requires tracking, escalation, or external system integration (e.g. Jira). A message can become a ticket, but not all messages need to be tickets.

---

## 1. Authentication & Security

Odly uses secure, encrypted authentication for all users.

### Registration & Login

- **Two-step login**: first verify your email address, then select which organization to enter
- A user can belong to multiple organizations — during login you choose which one to access
- **Registration** creates a new user account; email verification is required before access
- **Invitation-based onboarding**: admins invite users by email with a pre-assigned role; the invitee completes registration and joins automatically

### Email Verification

- Verification email sent on registration
- Resend verification option if the original expires

### Password Management

- **Forgot password** — request a reset link by email
- **Reset password** — use the link from the email to set a new password
- **Change password** — logged-in users can change their password (requires current password)

### Security

- **CAPTCHA protection** on login, registration, and password reset to prevent bots
- **Rate limiting** on authentication to prevent abuse
- All data is fully isolated between organizations — one organization cannot see another's data

### User Invitations

- Admins can invite users to the organization with a specific role
- Pending invitations can be listed and cancelled
- Invitations have an expiration date
- Invited users register with the pre-assigned role and organization

---

## 2. Inbox & Messages

The inbox is where all incoming messages from all channels appear in one place.

### What you see

- Sender, subject, content preview
- Status: New / In Progress / Pending / Resolved / Closed / Filtered
- Priority: Low / Medium / High / Critical
- Channel source (Email, Telegram, Slack, Chat Widget)
- AI-detected badges: category, lead flag, spam flag, ticket-worthy indicator
- Assignee, thread info, attachments

### Views

- **All messages** — flat list of every incoming message
- **By contact** — grouped by sender, so you see the full history of any person
- **By thread** — grouped by email conversation thread
- **Spam logs** — filtered/rejected messages for review

### Filters

You can filter by: channel, status, priority, department, assignee, date range, category, lead flag, spam flag, attachment presence, awaiting response, and more.

### Actions on a message

- **Reply** — send a direct response to the sender
- **Create ticket** — convert into a tracked ticket
- **Assign** — route to a specific team member (thread-based: assigning one message assigns the entire thread)
- **Set priority** — override AI-detected priority
- **Categorize** — override AI-detected category
- **Mark resolved** — close the conversation
- **Add notes** — internal notes visible only to your team
- **Flag as lead** — route to sales workflow
- **Add labels** — attach custom labels for organization and filtering
- **Translate** — translate message content to any supported language
- **Similar messages** — find previously resolved messages with the same issue

### Email threading

When customers reply to your emails, their replies are automatically grouped into the original conversation thread. You see the full exchange in order, not scattered messages — even across different email providers.

### Duplicate prevention

Odly automatically detects and prevents duplicate messages from being processed, so your inbox stays clean even if the same message arrives more than once.

---

## 3. Tickets

Tickets are for cases that need tracking, collaboration, or integration with external tools.

### Ticket lifecycle

```
Pending → Open → In Progress → Resolved → Closed
```

### What a ticket contains

- Title and description
- Status and priority
- Assigned agent
- Category and department
- SLA timers (first response + resolution)
- Comments (internal notes or external messages)
- Attachments (uploaded files, optionally synced to Jira)
- Link to original message
- Link to external issue (Jira, Asana, Linear, etc.)

### Ticket actions

- **Reply to sender** — send a response email
- **Add comment** — internal discussion or external note
- **Upload attachments** — files attached to the ticket
- **Assign** — route to a team member
- **Add labels** — attach custom labels for categorization
- **Translate** — translate ticket content to any supported language
- **Enhance with AI** — AI formats and improves the ticket description
- **Push to Jira** — create or update a Jira issue
- **Sync from Jira** — pull latest comments and status from Jira
- **Find similar** — AI suggests previously resolved tickets with similar content

### Attachments flow

Attachments flow automatically through the system:

1. Email arrives with attachments → attachments are stored and linked to the message
2. Ticket created from message → attachments are carried over to the ticket
3. Ticket pushed to Jira → attachments are uploaded to the Jira issue
4. Telegram photos, documents, videos, and voice messages are also captured and stored

---

## 4. Channels & Integrations

Odly connects to all the places your customers reach you.

### Email (IMAP / Gmail)

- Connect any IMAP-compatible email inbox (Gmail, Outlook, Zoho, custom)
- Gmail also supports secure one-click authorization
- Odly polls your inbox and imports new messages automatically
- Full conversation thread tracking
- Sent folder monitoring (outgoing emails also tracked)

### Telegram

- Connect one or more Telegram bots per organization
- Incoming user messages appear in the inbox
- Full conversation threading
- **AI auto-reply**: bot can auto-respond using documentation and KB, with escalation to human agents
- **Attachment support**: photos, documents, videos, and voice messages are downloaded and stored
- **Group monitoring**: bot can monitor group chats and extract support-relevant messages
- Multi-language support with automatic language detection
- Escalation flow: bot offers to create a support ticket if it can't help

### Slack

- Connect a Slack workspace
- Monitor specific channels
- Messages and threads appear in the inbox

### Chat Widget

- Embeddable widget for your website (see [Chat Widget Documentation](chat-widget.md))
- Visitors send messages that arrive in your inbox like any other channel
- **Domain allowlist**: restrict which domains can embed the widget
- **Customizable appearance**: colors, position (left/right), theme (light/dark), welcome message
- **Collect user info**: optionally require name/email before chat
- AI-powered replies using your organization's knowledge base and documentation
- Built-in abuse prevention
- Multi-language auto-detection and response

### Ticketing Systems

Connect your external project management or ticketing tools:

| System     | Features                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| **Jira**   | Full sync: create issues, update status, bi-directional comment sync, attachment sync, webhook support |
| Asana      | Create and link tasks                                                                                  |
| Linear     | Create and link issues                                                                                 |
| ClickUp    | Create and link tasks                                                                                  |
| Monday.com | Create and link items                                                                                  |
| Zoho       | Create and link tickets                                                                                |

---

## 5. AI Features

AI is built into the core of how Odly processes messages. It runs automatically on every incoming message.

### Supported AI Providers

You connect your own AI provider key. Supported providers:

- **OpenAI** (GPT-4, GPT-4o, GPT-3.5)
- **Anthropic** (Claude models)
- **DeepSeek**
- **Perplexity**
- **Local / Self-hosted** (for privacy-sensitive deployments)

Each organization configures its own provider and models independently.

### AI Provider Management

- **Preferred provider**: each organization selects its preferred AI provider
- **Health checks**: verify that your configured provider is reachable and responding
- **Model listing**: browse available models from your connected provider
- **Local models**: option to use a local AI model for privacy-sensitive deployments

### AI Modules

- Individual AI features can be toggled on/off per organization
- You only pay for and use the modules you enable
- Modules include: spam detection, categorization, lead detection, auto-reply, suggested answers, translation, follow-up generation, and more

---

### 5.1 Automatic Message Analysis

Every incoming message is analyzed automatically:

| What AI detects        | What it does                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **Spam / Promotional** | Filters out newsletters, out-of-office replies, phishing, marketing emails           |
| **Category**           | Assigns the message to a support category (e.g. Billing, Technical, General)         |
| **Priority**           | Suggests Low / Medium / High / Critical based on message content and urgency signals |
| **Ticket-worthy**      | Flags whether this message needs a formal ticket or can be handled directly          |
| **Lead**               | Detects if the sender is a potential sales lead                                      |
| **Needs more info**    | Flags messages where the request is unclear or incomplete                            |
| **Human review**       | Escalates edge cases that the AI is not confident about                              |

### 5.2 Suggested Answers

When an agent opens a message or ticket, Odly searches your Knowledge Base and uploaded documentation to suggest a relevant answer. The suggestion shows:

- The proposed response text
- Which KB entries or document sections were used as sources
- A confidence score

The agent can use the suggestion as-is, edit it, or ignore it. If the suggestion was helpful, it can be saved back to the KB with one click.

### 5.3 AI Reply (Auto-Response)

Odly can generate and send AI replies automatically for certain message types.

**How auto-reply works:**

When a new message arrives, Odly searches through multiple sources to find the best answer:

1. Your uploaded documentation
2. Your knowledge base
3. Previously resolved tickets with similar content
4. Previously resolved messages with similar content
5. Response rules you’ve configured
6. If none of the above match confidently — escalate to a human agent

**Confidence thresholds (configurable per organization):**

- **High confidence** — auto-send the reply immediately
- **Medium confidence** — save as a suggested answer for agent review
- **Low confidence** — skip and let a human handle it

The confidence threshold is adjustable per organization (default: 90%).

**Duplicate prevention:**

Odly ensures only one AI reply is sent per conversation thread, and will not reply if an agent has already responded.

**Telegram auto-reply** has additional features:

- Greeting detection (skips greetings without a question)
- Conversation context (uses recent messages for continuity)
- Escalation flow: offers to create a support ticket when the bot can’t help
- Multi-language support (English, Ukrainian, Russian, Spanish, German, French)

Controlled via Response Rules (see Section 8) and Organization Settings.

### 5.4 Contradiction Detection

AI checks messages for internal inconsistencies or contradictions with previous interactions — useful for detecting fraud attempts or confusion.

### 5.5 Follow-Up Questions

For incomplete or ambiguous requests, AI can generate a list of clarifying questions to send to the customer.

### 5.6 Similar Message & Ticket Finder

Uses semantic (meaning-based) search to surface previously resolved messages or tickets that match the current one — helping agents quickly find what worked before.

### 5.7 Multilingual

All AI features work across languages. The AI detects the customer's language and responds in it, even if your entire Knowledge Base is written in a different language.

### 5.8 Ticket Description Enhancement

AI can reformat and improve ticket descriptions — structuring messy email content into a clean, readable format with proper sections and formatting.

### 5.9 Response Tracking & Feedback

When agents use AI-suggested responses:

- The system tracks which suggestions were used vs. ignored
- Agents can submit feedback (helpful / not helpful) on suggestions
- Effectiveness statistics are tracked per knowledge base entry
- This feedback loop continuously improves future suggestion quality

---

## 6. Knowledge Base

The Knowledge Base (KB) is Odly's memory. It stores question-and-answer pairs, manual entries, and document extracts that AI uses when suggesting answers.

### Entry types

- **Q&A pairs** — extracted automatically from resolved messages and tickets
- **Manual entries** — written by your team
- **Documents** — uploaded files, split into searchable chunks

### Approval workflow

New KB entries go through an approval step before they appear in AI suggestions. Your team reviews and approves or hides each entry to ensure quality.

### Usage tracking

Every KB entry tracks how many times it was used in a suggested answer. You can see which entries are most valuable and which are underused.

### Documentation uploads

Upload your own documents (PDFs, text files, guides, policies) and Odly will:

1. Split them into chunks with configurable size (Small / Medium / Large / Whole)
2. Index them for AI-powered search
3. Make them available to AI when answering questions

Document types supported:

- Technical documentation and how-to guides
- Company policies
- Legal documents and NDAs
- Email templates
- General reference material

You control which department each document is available to, and whether the AI is allowed to quote from it directly.

---

## 7. Contact Management

Every sender becomes a **Contact** in Odly. The contact profile shows:

- Full message and ticket history
- Internal notes added by your team
- Labels/tags assigned
- Any linked duplicate contacts (merged profiles)
- Interaction statistics

### Actions on a contact

- Add / remove labels
- Add / edit internal notes
- Link contacts (merge duplicate profiles)
- Update contact information

### Labels

Labels are custom tags that can be attached to messages, tickets, and contacts for organization and filtering.

- Create, edit, and delete labels per organization
- Assign labels to messages, tickets, and contacts
- Use labels to filter your inbox and ticket views
- Only users with the appropriate role can create or manage labels

### Categories

Categories are used for classifying messages and tickets. Unlike labels, categories are used by AI for automatic classification.

- Create categories with a name, description, and keywords
- AI automatically matches incoming messages to the most relevant category
- Categories are department-scoped
- Only users with the appropriate role can create or manage categories

---

## 8. Rules & Automation

Rules let you customize how Odly classifies and routes messages without writing code.

### Spam Rules

Define patterns that identify unwanted messages. Each rule has:

- A pattern (keywords or regex matching subject, sender, or content)
- Example text (helps AI learn what spam looks like for your organization)
- A severity score (0–100)
  - **1–49**: Flag as suspicious
  - **50–99**: Mark as spam and filter
  - **100**: Critical — reject immediately and do not save

**How spam detection works:**

Odly uses multiple layers to detect spam accurately:

1. Pattern matching against your rules
2. AI-powered similarity analysis (compares against known spam examples)
3. Automatic checks (e.g. emails from known trusted services like Google or Microsoft are never blocked)

**Red flags and green flags:** Every message shows both spam indicators (red) and legitimacy indicators (green) for full transparency. Agents can see exactly why a message was classified the way it was.

**Multi-language support:** Spam detection works across 8 languages, including unsubscribe link detection in English, Ukrainian, Russian, German, French, Spanish, Italian, and Dutch.

### Detection Rules

Define patterns that identify legitimate support messages (the opposite of spam rules). Each rule boosts the confidence that a message is genuine.

### Priority Rules

Define what makes a message high priority — certain keywords, phrases, or patterns that indicate urgency.

### Knowledge Detection Rules

Define what kind of content is worth extracting into the Knowledge Base — for example, messages that mention pricing, processes, policies, or technical specifications.

### Response Rules

Define when the AI should send automatic responses. Each rule specifies:

- What triggers it (a category, a pattern, a topic)
- What to respond with (AI-generated, a fixed template, or a hybrid)
- Conditions that must be met (e.g. "only if no previous bot reply has been sent", "only if KB was referenced", "only if customer sentiment is neutral")
- Language, department, and priority settings

---

## 9. Lead Qualification

Odly includes a dedicated lead tracking workflow for sales teams.

- Incoming messages are automatically analyzed for lead signals
- Messages flagged as leads are routed to the Sales department
- Each lead contact is enriched with detected category, language, and engagement signals
- Leads are tracked separately from support messages
- Your team can manually flag or unflag any message as a lead

### Lead Configuration (per organization)

- **Enable/disable** lead qualification
- **Custom qualifying criteria** — define what signals indicate a lead (e.g. pricing questions, feature requests, demo requests)
- Configured in your Organization Settings

---

## 10. Auto-Assignment

Odly can automatically route incoming messages and tickets to the right team member.

**Routing is based on:**

- Department membership
- Custom skill keys you define (e.g. language, timezone, expertise area)
- Each team member sets their values for these keys (e.g. language: French)
- Odly matches incoming message attributes to available agents

Auto-assignment can be enabled or disabled per department, with a fallback default assignee.

### Routing Keys

- Organization admins define custom routing keys (e.g. language, timezone, expertise area, product line)
- Each team member sets their values for these keys
- When a message arrives, Odly matches it against available agents' skill values
- You can create, edit, and delete routing keys at any time

---

## 11. Translation

Odly has built-in translation for messages and tickets, powered by your configured AI provider.

### What can be translated

- **Messages** — translate any incoming customer message to your team's language
- **Tickets** — translate the ticket description and content
- **Free text** — translate any arbitrary text snippet

### How it works

- Click Translate on any message or ticket and select the target language
- The translated version appears inline — the original is preserved
- Streaming mode is available for long content (text appears progressively as it's generated)

### Supported languages

The platform returns a dynamic list of supported languages based on the connected AI provider. Typically includes all major world languages.

---

## 12. Spam Log Analytics

Every filtered (spam) message is logged and available for review — not just silently dropped. This gives your team visibility into what is being filtered and why.

### What the spam log shows

- Sender email and domain
- Subject and content snippet
- Matched spam rule and pattern
- Category (spam, promotional, phishing, out-of-office, invalid, etc.)
- Severity score (0–100)
- Confidence score
- Red flags (reasons it was flagged) and green flags (signals it was legitimate)
- Channel and department

### Filters available

- By channel (email, Telegram, Slack)
- By category
- By department
- By sender domain
- By minimum severity
- By date range (last N days)

### Spam statistics

A separate statistics view shows:

- Total filtered messages in the period
- Breakdown by category, channel, and department
- Top sender domains being filtered
- Average severity and confidence scores

### Cleanup

Org admins can delete old spam log entries (default: older than 90 days) to keep things tidy.

---

## 13. SLA Tracking

Odly tracks response time targets for every message and ticket.

**Default SLA targets by channel:**

| Channel     | First Response Target |
| ----------- | --------------------- |
| Email       | 60 minutes            |
| Telegram    | 5 minutes             |
| Slack       | 15 minutes            |
| Chat Widget | 5 minutes             |

**Ticket resolution targets** are configurable per category.

The SLA dashboard shows:

- Current SLA compliance rate
- Recent breaches with details
- Trend over time (7 / 14 / 30 days)
- Per-department and per-channel breakdown

---

## 14. Statistics & Reporting

The Statistics page gives your team full visibility into support operations.

**Metrics available:**

| Area                   | Metrics                                                     |
| ---------------------- | ----------------------------------------------------------- |
| **Volume**             | Total messages, tickets, open items, resolved items         |
| **Response time**      | Average first response time, average resolution time        |
| **Agent performance**  | Messages handled, tickets resolved, response time per agent |
| **SLA compliance**     | Breach rate, compliance rate, trends                        |
| **Channel breakdown**  | Volume by email / Telegram / Slack / chat widget            |
| **Category breakdown** | Volume and resolution by category                           |

All statistics support custom date ranges and department filtering.

---

## 15. Audit Logs

Every action taken in Odly is logged:

- Who performed it
- What was done (create, update, delete, assign, reply, etc.)
- When it happened
- What changed

Logs are searchable by user, action type, date range, and entity. Available to organization admins and moderators for compliance and security review.

---

## 16. User Roles & Permissions

### Organization Roles

| Role          | What they can do                                              |
| ------------- | ------------------------------------------------------------- |
| **Org Admin** | Full control: users, settings, integrations, rules, billing   |
| **Moderator** | Most admin features; cannot manage billing or email templates |
| **Support**   | Handle messages and tickets; cannot change settings           |
| **Associate** | View-only access to most areas                                |

### Department Roles

Users can have different access levels in different departments. For example, someone can be Support in the Billing department and Associate in Sales. This gives you fine-grained control over who sees and does what across your organization.

---

## 17. Prompt Customization

Advanced users can customize the AI prompts Odly uses for each operation:

- Message analysis
- Spam detection
- Category detection
- Lead qualification
- Auto-reply generation
- Response formatting

System prompts are provided as defaults. You can override them per department or create entirely custom versions. This lets you tailor AI behavior to your organization's tone, terminology, and policies.

---

## 18. Subscription & Usage

Each organization is on a subscription plan that defines:

- Maximum messages processed per month
- Number of users
- Number of integrations
- Access to specific AI modules and features

### Subscription page

Shows current plan details and active modules.

### Usage Stats page

A dedicated page with charts showing consumption over time:

- Current month usage per module (messages processed, AI calls, etc.)
- Progress bars against plan limits
- Overage tracking — how much is above the included limit and the estimated overage cost
- Historical trend chart (up to 12 months back) per module

Usage is tracked monthly per module and visible in real time.

---

## 19. Email Templates

Organization admins can customize the email templates used for system communications:

- **Invitation email** — sent when inviting a new team member
- **Verification email** — sent during registration for email verification
- **Preview and render** — preview templates with sample data before saving
- Templates support HTML with dynamic placeholders (e.g. user name, organization name, links)
- Only accessible to Org Admins

---

## Summary of Everything in One View

| Area                     | What it covers                                                 |
| ------------------------ | -------------------------------------------------------------- |
| **Auth & Security**      | Registration, login, email verification, CAPTCHA, invitations  |
| **Inbox**                | All channels in one place, filtered views, thread tracking     |
| **Tickets**              | Structured case management, SLA, Jira sync, attachments        |
| **Channels**             | Email, Telegram, Slack, Chat Widget, Jira, and more            |
| **AI Features**          | Spam detection, categorization, priority, auto-reply, and more |
| **Knowledge Base**       | Q&A pairs, document uploads, approval workflow                 |
| **Contacts**             | Full customer history, notes, labels, merged profiles          |
| **Labels & Categories**  | Custom tags and AI-powered classification                      |
| **Rules & Automation**   | Spam, detection, priority, KB extraction, auto-response        |
| **Leads**                | Sales-specific workflow and routing                            |
| **Auto-Assignment**      | Skill-based routing with custom routing keys                   |
| **Translation**          | Translate messages and tickets to 19+ languages                |
| **Spam Logs**            | Review filtered messages, red/green flags, domain analysis     |
| **SLA**                  | Response time targets and compliance monitoring                |
| **Statistics**           | Volume, performance, and channel analytics                     |
| **Audit Logs**           | Full action history for compliance                             |
| **Prompt Customization** | Fine-tune AI behavior per department                           |
| **Roles & Permissions**  | Granular access control per user and department                |
| **Email Templates**      | Customizable invitation and verification emails                |
| **Subscription & Usage** | Plan management, usage charts, overage tracking                |
