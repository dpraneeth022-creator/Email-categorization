export type MailProvider = 'gmail' | 'outlook' | 'yahoo' | 'imap' | 'import';

export interface ImapCredentials {
  email: string;
  password: string;
  host: string;
  port: number;
  providerLabel: string;
}

export type RuleAccent = 'blue' | 'emerald' | 'amber' | 'violet' | 'teal' | 'rose';

export interface ClassificationRule {
  id: string;
  name: string;
  shortName: string;
  description: string;
  accent: RuleAccent;
  senders: string[];
  keywords: string[];
  useAiSemantics: boolean;
  isSystemDefault?: boolean;
}

export interface TrainingFeedbackExample {
  id: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  assignedCategoryId: string;
  createdAt: string;
}

export interface MailClassification {
  categoryId: string;
  confidence: number;
  matchedBy: 'directory' | 'ai_semantic' | 'user_feedback';
  reason: string;
}

export interface MailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentId?: string;
  inlineDataBase64?: string;
}

export interface MailMessage {
  id: string;
  threadId?: string;
  provider: MailProvider;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  originalSender?: string;
  to: string;
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml?: string;
  webLink?: string;
  attachments?: MailAttachment[];
  labelIds?: string[];
  fullBodyLoaded?: boolean;
  dateIso: string;
  unread: boolean;
  classification?: MailClassification;
}

export interface ConnectedAccount {
  provider: MailProvider;
  email: string;
  displayName: string;
  photoUrl?: string;
  providerLabel?: string;
}

export interface ProviderConfigStatus {
  campus: {
    allowedDomains: string[];
    primaryDomain: string;
    appUrl: string;
  };
  gmail: {
    configured: boolean;
  };
  outlook: {
    configured: boolean;
    callbackUrl: string;
  };
  yahoo: {
    configured: boolean;
    callbackUrl: string;
  };
}
