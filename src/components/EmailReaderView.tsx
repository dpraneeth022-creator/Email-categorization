import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MailCheck,
  MailOpen,
  Maximize2,
  Minimize2,
  Paperclip,
} from 'lucide-react';
import type {
  ClassificationRule,
  MailAttachment,
  MailMessage,
} from '../shared/types';

interface EmailReaderViewProps {
  message: MailMessage;
  rules: ClassificationRule[];
  currentIndex: number;
  totalCount: number;
  isExpanded: boolean;
  isLoadingFullBody?: boolean;
  onBackMobile: () => void;
  onToggleExpand: () => void;
  onSelectPrevious: () => void;
  onSelectNext: () => void;
  onToggleReadState: (messageId: string, unread: boolean) => void;
  onReassignMessage: (
    message: MailMessage,
    newCategoryId: string,
    addSenderToDirectory: boolean
  ) => void;
  onDownloadAttachment: (message: MailMessage, attachment: MailAttachment) => Promise<void>;
}

function formatFullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'File';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildSandboxedHtmlDoc(bodyHtml: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none';" />
  <base target="_blank" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #1e293b;
      font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 15px;
      line-height: 1.65;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      overflow-x: auto;
    }
    img {
      max-width: 100% !important;
      height: auto !important;
    }
    table {
      max-width: 100%;
    }
    a {
      color: #1d4ed8;
      text-decoration: underline;
    }
    blockquote {
      margin: 12px 0;
      padding-left: 14px;
      border-left: 2px solid #cbd5e1;
      color: #475569;
    }
    pre, code {
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 13px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function renderLinkifiedText(text: string): React.ReactNode[] {
  const tokenRegex = /(https?:\/\/[^\s<>"')]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-700 underline underline-offset-2 hover:text-blue-900 break-all"
        >
          {part}
        </a>
      );
    }
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(part)) {
      return (
        <a
          key={idx}
          href={`mailto:${part}`}
          className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const EmailReaderView: React.FC<EmailReaderViewProps> = ({
  message,
  rules,
  currentIndex,
  totalCount,
  isExpanded,
  isLoadingFullBody = false,
  onBackMobile,
  onToggleExpand,
  onSelectPrevious,
  onSelectNext,
  onToggleReadState,
  onReassignMessage,
  onDownloadAttachment,
}) => {
  const hasHtml = Boolean(message.bodyHtml && message.bodyHtml.trim().length > 0);
  const [viewMode, setViewMode] = useState<'html' | 'text'>(hasHtml ? 'html' : 'text');
  const [iframeHeight, setIframeHeight] = useState<number>(420);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [addSenderOnMove, setAddSenderOnMove] = useState(true);
  const [moveFeedbackMsg, setMoveFeedbackMsg] = useState<string | null>(null);
  const [copiedSender, setCopiedSender] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Reset reader view state whenever the opened email changes
  useEffect(() => {
    setViewMode(Boolean(message.bodyHtml && message.bodyHtml.trim()) ? 'html' : 'text');
    setIframeHeight(420);
    setDownloadError(null);
    setCopiedSender(false);
  }, [message.id, message.bodyHtml]);

  const sandboxedSrcDoc = useMemo(() => {
    if (!message.bodyHtml) return '';
    return buildSandboxedHtmlDoc(message.bodyHtml);
  }, [message.bodyHtml]);

  const measureIframeHeight = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;
      const measured = Math.max(
        doc.body.scrollHeight,
        doc.documentElement?.scrollHeight || 0,
        240
      );
      setIframeHeight(Math.min(measured + 28, 6000));
    } catch {
      // Fallback height if browser restricts measurement
      setIframeHeight(560);
    }
  };

  const handleIframeLoad = () => {
    measureIframeHeight();
    const iframe = iframeRef.current;
    try {
      const doc = iframe?.contentDocument;
      if (!doc) return;
      const images = Array.from(doc.querySelectorAll('img'));
      for (const img of images) {
        if (!img.complete) {
          img.addEventListener('load', measureIframeHeight, { once: true });
          img.addEventListener('error', measureIframeHeight, { once: true });
        }
      }
      setTimeout(measureIframeHeight, 180);
    } catch {
      // Ignore if cross-origin
    }
  };

  const matchedRule = rules.find((r) => r.id === message.classification?.categoryId);

  const handleMove = (newCategoryId: string) => {
    onReassignMessage(message, newCategoryId, addSenderOnMove);
    const targetName =
      newCategoryId === 'general'
        ? 'General Inbox'
        : rules.find((r) => r.id === newCategoryId)?.name || newCategoryId;
    setMoveFeedbackMsg(
      addSenderOnMove && newCategoryId !== 'general'
        ? `Moved to ${targetName} and saved sender to trained rules.`
        : `Moved to ${targetName} and recorded as training feedback.`
    );
    setTimeout(() => setMoveFeedbackMsg(null), 3200);
  };

  const handleCopySender = async () => {
    if (!message.fromEmail) return;
    try {
      await navigator.clipboard.writeText(message.fromEmail);
      setCopiedSender(true);
      setTimeout(() => setCopiedSender(false), 1800);
    } catch {
      // Clipboard blocked in sandboxed context; fail quietly
    }
  };

  const handleAttachmentClick = async (att: MailAttachment) => {
    setDownloadingId(att.id);
    setDownloadError(null);
    try {
      await onDownloadAttachment(message, att);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Unable to download attachment.');
    } finally {
      setDownloadingId(null);
    }
  };

  const visibleAttachments = useMemo(
    () => (message.attachments ?? []).filter((att) => Boolean(att.filename)),
    [message.attachments]
  );

  const providerOpenLabel =
    message.provider === 'gmail'
      ? 'Open in Gmail'
      : message.provider === 'outlook'
      ? 'Open in Outlook'
      : 'Open Original';

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-w-0 h-full overflow-hidden">
      {/* Top Reader Toolbar */}
      <div className="h-12 bg-white border-b border-slate-200 px-3 sm:px-5 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Mobile Back to Inbox button */}
          <button
            type="button"
            onClick={onBackMobile}
            className="md:hidden h-9 px-2.5 text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Back</span>
          </button>

          {/* Desktop Expand / Split View toggle */}
          <button
            type="button"
            onClick={onToggleExpand}
            className="hidden md:inline-flex h-8 px-2.5 text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-lg items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title={isExpanded ? 'Return to split view (Esc)' : 'Expand email to full width'}
          >
            {isExpanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 shrink-0" />
                <span>Split View</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                <span>Expand</span>
              </>
            )}
          </button>

          <span className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:inline-block" aria-hidden="true" />

          {/* Prev / Next Navigation */}
          <div className="inline-flex items-center gap-0.5">
            <button
              type="button"
              onClick={onSelectPrevious}
              disabled={currentIndex <= 0}
              aria-label="Previous email"
              title="Previous email"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:text-slate-950 hover:bg-slate-100 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onSelectNext}
              disabled={currentIndex < 0 || currentIndex >= totalCount - 1}
              aria-label="Next email"
              title="Next email"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:text-slate-950 hover:bg-slate-100 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {totalCount > 0 && currentIndex >= 0 && (
            <span className="text-[11px] font-mono tabular-nums text-slate-500 pl-1 hidden sm:inline">
              {currentIndex + 1} / {totalCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onToggleReadState(message.id, !message.unread)}
            className="h-8 px-2.5 text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title={message.unread ? 'Mark as read' : 'Mark as unread'}
          >
            {message.unread ? (
              <>
                <MailCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Mark Read</span>
              </>
            ) : (
              <>
                <MailOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Mark Unread</span>
              </>
            )}
          </button>

          {message.webLink && (
            <a
              href={message.webLink}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-3 text-xs font-medium text-blue-700 bg-blue-50/70 border border-blue-200 hover:bg-blue-100/70 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{providerOpenLabel}</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          )}
        </div>
      </div>

      {/* Scrollable Email Content Canvas */}
      <div className="flex-1 overflow-y-auto mail-scroll p-4 sm:p-6 lg:p-8">
        <div
          className={`mx-auto space-y-5 transition-[max-width] duration-150 ${
            isExpanded ? 'max-w-5xl' : 'max-w-3xl'
          }`}
        >
          {/* Classification Inspector & Move/Train Bar */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-950">
                  {matchedRule?.name || 'GENERAL INBOX'}
                </span>
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span className="text-slate-600">
                  {message.classification?.matchedBy === 'directory'
                    ? 'Sender Directory Match'
                    : message.classification?.matchedBy === 'user_feedback'
                    ? 'User Trained Correction'
                    : 'Gemini Semantic Classification'}
                </span>
                {message.classification && (
                  <>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {Math.round(message.classification.confidence * 100)}% confidence
                    </span>
                  </>
                )}
              </div>
            </div>

            {message.classification?.reason && (
              <p className="text-xs text-slate-600 leading-relaxed">
                {message.classification.reason}
              </p>
            )}

            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 mr-1">Move &amp; train as:</span>
                {rules.map((rule) => {
                  const isCurrent = message.classification?.categoryId === rule.id;
                  return (
                    <button
                      key={rule.id}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => handleMove(rule.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                        isCurrent
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-default'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400 hover:text-slate-950'
                      }`}
                    >
                      {rule.shortName}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={(message.classification?.categoryId || 'general') === 'general'}
                  onClick={() => handleMove('general')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    (message.classification?.categoryId || 'general') === 'general'
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-default'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400 hover:text-slate-950'
                  }`}
                >
                  General
                </button>
              </div>

              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addSenderOnMove}
                  onChange={(e) => setAddSenderOnMove(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
                Remember sender address
              </label>
            </div>

            {moveFeedbackMsg && (
              <div className="text-xs text-emerald-700 font-medium inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>{moveFeedbackMsg}</span>
              </div>
            )}
          </section>

          {/* Main Email Document Card */}
          <article className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Subject & Envelope Header */}
            <header className="p-5 sm:p-6 lg:p-8 pb-5 border-b border-slate-200 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2
                  className="text-lg sm:text-xl font-bold text-slate-950 leading-snug flex-1 min-w-0"
                  style={{ textWrap: 'balance' }}
                >
                  {message.subject}
                </h2>

                {hasHtml && (
                  <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewMode('html')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                        viewMode === 'html'
                          ? 'bg-white text-slate-950 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Rich View
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('text')}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                        viewMode === 'text'
                          ? 'bg-white text-slate-950 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Plain Text
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-start justify-between gap-3 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-slate-900">{message.fromName}</span>
                    {message.fromEmail && (
                      <span className="font-mono text-slate-500 break-all">
                        &lt;{message.fromEmail}&gt;
                      </span>
                    )}
                    {message.fromEmail && (
                      <button
                        type="button"
                        onClick={handleCopySender}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                        title="Copy sender email address"
                      >
                        {copiedSender ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" />
                            <span className="text-emerald-700">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {message.replyTo && message.replyTo !== message.fromEmail && (
                    <div className="text-slate-500 break-all">
                      Reply-To: <span className="font-mono">{message.replyTo}</span>
                    </div>
                  )}
                  {message.to && (
                    <div className="text-slate-500 break-all">
                      To: <span className="font-mono">{message.to}</span>
                    </div>
                  )}
                </div>

                <time className="font-mono tabular-nums text-slate-500 shrink-0">
                  {formatFullDate(message.dateIso)}
                </time>
              </div>
            </header>

            {/* Attachments Section */}
            {visibleAttachments.length > 0 && (
              <div className="px-5 sm:px-6 lg:px-8 py-4 bg-slate-50/70 border-b border-slate-200 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>
                    {visibleAttachments.length} attachment
                    {visibleAttachments.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visibleAttachments.map((att) => {
                    const isDownloading = downloadingId === att.id;
                    const canDownload =
                      Boolean(att.inlineDataBase64) ||
                      (message.provider === 'gmail' && !att.id.startsWith('inline-'));
                    return (
                      <div
                        key={att.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg min-w-0"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-900 truncate">
                              {att.filename}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-500 truncate">
                              {formatFileSize(att.sizeBytes)}
                            </div>
                          </div>
                        </div>

                        {canDownload && (
                          <button
                            type="button"
                            disabled={isDownloading}
                            onClick={() => handleAttachmentClick(att)}
                            className="h-8 px-2.5 text-xs font-medium text-slate-700 hover:text-slate-950 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-60"
                          >
                            {isDownloading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            <span>{isDownloading ? 'Saving...' : 'Download'}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {downloadError && (
                  <p role="alert" className="text-xs text-red-700">
                    {downloadError}
                  </p>
                )}
              </div>
            )}

            {/* Email Body Content */}
            <div className="p-5 sm:p-6 lg:p-8 space-y-4">
              {isLoadingFullBody && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700 shrink-0" />
                  <span>Loading full formatted message and attachments...</span>
                </div>
              )}

              {hasHtml && viewMode === 'html' ? (
                <iframe
                  ref={iframeRef}
                  title={`Email content: ${message.subject}`}
                  srcDoc={sandboxedSrcDoc}
                  onLoad={handleIframeLoad}
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  className="w-full border-0 block bg-white"
                  style={{ height: `${iframeHeight}px`, minHeight: '240px' }}
                />
              ) : (
                <div className="text-[15px] text-slate-800 leading-[1.7] whitespace-pre-wrap break-words max-w-[72ch]">
                  {renderLinkifiedText(
                    message.bodyText || message.snippet || '(Empty message body)'
                  )}
                </div>
              )}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
};
