import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Inbox,
  Loader2,
  LogOut,
  Mail,
  Menu,
  Paperclip,
  PenSquare,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import type { SyncProgressState } from '../App';
import { decodeHtmlEntities } from '../shared/classifierRules';
import type {
  ClassificationRule,
  ConnectedAccount,
  MailAttachment,
  MailMessage,
  RuleAccent,
} from '../shared/types';
import { ComposeModal, type ComposeDraftPayload } from './ComposeModal';
import { EmailReaderView } from './EmailReaderView';
import { GoogleGIcon, OutlookIcon, YahooIcon } from './ProviderIcons';

interface MailWorkspaceProps {
  account: ConnectedAccount;
  messages: MailMessage[];
  rules: ClassificationRule[];
  isFetchingMail: boolean;
  isLoadingOlder: boolean;
  isClassifying: boolean;
  syncProgress: SyncProgressState;
  loadingFullMessageId: string | null;
  reclassifyingMessageId: string | null;
  busyActionMessageId: string | null;
  isEmptyingTrash: boolean;
  needsGmailReconnect: boolean;
  needsMailActionScopeReauth: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  toastMessage: string | null;
  onDismissToast: () => void;
  onSyncInbox: () => void;
  onStopSync: () => void;
  onLoadOlderMail: () => void;
  onReconnectGmail: () => void;
  onReauthorizeGmail: () => Promise<boolean>;
  onSignOut: () => void;
  onToggleReadState: (messageId: string, unread: boolean) => void;
  onDownloadAttachment: (message: MailMessage, attachment: MailAttachment) => Promise<void>;
  onEnsureFullMessage: (message: MailMessage) => void;
  onManualReclassifyMessage: (message: MailMessage) => void;
  onManualMoveMessage: (messageId: string, targetCategoryId: string) => void;
  onSendEmail: (draft: ComposeDraftPayload) => Promise<{
    ok: boolean;
    error?: string;
    needsReauth?: boolean;
  }>;
  onTrashMessage: (message: MailMessage) => Promise<void>;
  onRestoreMessage: (message: MailMessage) => Promise<void>;
  onDeleteForeverMessage: (message: MailMessage) => Promise<void>;
  onEmptyTrash: () => Promise<void>;
}

const ACCENT_DOT_CLASS: Record<RuleAccent, string> = {
  blue: 'bg-blue-700',
  emerald: 'bg-emerald-700',
  amber: 'bg-amber-600',
  violet: 'bg-violet-700',
  teal: 'bg-teal-700',
  rose: 'bg-rose-700',
};

const ACCENT_TEXT_CLASS: Record<RuleAccent, string> = {
  blue: 'text-blue-700',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  violet: 'text-violet-700',
  teal: 'text-teal-700',
  rose: 'text-rose-700',
};

function isMessageTrashed(msg: MailMessage): boolean {
  return Boolean(msg.labelIds?.includes('TRASH'));
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const MailWorkspace: React.FC<MailWorkspaceProps> = ({
  account,
  messages,
  rules,
  isFetchingMail,
  isLoadingOlder,
  isClassifying,
  syncProgress,
  loadingFullMessageId,
  reclassifyingMessageId,
  busyActionMessageId,
  isEmptyingTrash,
  needsGmailReconnect,
  needsMailActionScopeReauth,
  statusMessage,
  errorMessage,
  toastMessage,
  onDismissToast,
  onSyncInbox,
  onStopSync,
  onLoadOlderMail,
  onReconnectGmail,
  onReauthorizeGmail,
  onSignOut,
  onToggleReadState,
  onDownloadAttachment,
  onEnsureFullMessage,
  onManualReclassifyMessage,
  onManualMoveMessage,
  onSendEmail,
  onTrashMessage,
  onRestoreMessage,
  onDeleteForeverMessage,
  onEmptyTrash,
}) => {
  const [activeFolder, setActiveFolder] = useState<string>('all');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isMobileReaderOpen, setIsMobileReaderOpen] = useState(false);
  const [isDesktopExpanded, setIsDesktopExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [visibleListCount, setVisibleListCount] = useState(100);
  const [copiedCampusLink, setCopiedCampusLink] = useState(false);

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<
    | { type: 'delete_forever'; message: MailMessage }
    | { type: 'empty_trash'; count: number }
    | null
  >(null);

  const PUBLIC_CAMPUS_URL = 'https://email-categorization-tbkl.onrender.com';
  const isInternalPreviewContainer =
    typeof window !== 'undefined' && /^https?:\/\/ais-(dev|pre)-/i.test(window.location.origin);

  const handleCopyCampusLink = async () => {
    if (typeof window === 'undefined') return;
    const shareUrl = isInternalPreviewContainer
      ? PUBLIC_CAMPUS_URL
      : window.location?.origin || PUBLIC_CAMPUS_URL;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedCampusLink(true);
      setTimeout(() => setCopiedCampusLink(false), 2000);
    } catch {
      // Clipboard blocked in sandboxed frame
    }
  };

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: 0,
      general: 0,
      trash: 0,
    };
    for (const rule of rules) {
      counts[rule.id] = 0;
    }
    for (const msg of messages) {
      if (isMessageTrashed(msg)) {
        counts.trash += 1;
        continue;
      }
      counts.all += 1;
      const cat = msg.classification?.categoryId || 'general';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [messages, rules]);

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return messages.filter((msg) => {
      const trashed = isMessageTrashed(msg);
      if (activeFolder === 'trash') {
        if (!trashed) return false;
      } else {
        if (trashed) return false;
        const cat = msg.classification?.categoryId || 'general';
        if (activeFolder !== 'all' && cat !== activeFolder) return false;
      }

      if (unreadOnly && !msg.unread) return false;
      if (q) {
        const haystack =
          `${msg.fromName} ${msg.fromEmail} ${msg.subject} ${msg.snippet}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [messages, activeFolder, unreadOnly, searchQuery]);

  const selectedMessage = useMemo(() => {
    if (!selectedMessageId) return filteredMessages[0] || null;
    return (
      filteredMessages.find((m) => m.id === selectedMessageId) ||
      filteredMessages[0] ||
      null
    );
  }, [filteredMessages, selectedMessageId]);

  const selectedIndex = useMemo(() => {
    if (!selectedMessage) return -1;
    return filteredMessages.findIndex((m) => m.id === selectedMessage.id);
  }, [filteredMessages, selectedMessage]);

  const activeFolderLabel = useMemo(() => {
    if (activeFolder === 'all') return 'All Mail';
    if (activeFolder === 'general') return 'General Inbox';
    if (activeFolder === 'trash') return 'Trash';
    return rules.find((r) => r.id === activeFolder)?.name || activeFolder;
  }, [activeFolder, rules]);

  const getRuleById = (id?: string) => rules.find((r) => r.id === id);

  const handleOpenMessage = (msg: MailMessage, expandDesktop = false) => {
    setSelectedMessageId(msg.id);
    setIsMobileReaderOpen(true);
    if (expandDesktop) {
      setIsDesktopExpanded(true);
    }
    if (msg.unread) {
      onToggleReadState(msg.id, false);
    }
  };

  const handleStepMessage = (delta: -1 | 1) => {
    if (selectedIndex < 0) return;
    const nextIdx = selectedIndex + delta;
    if (nextIdx < 0 || nextIdx >= filteredMessages.length) return;
    const nextMsg = filteredMessages[nextIdx];
    setSelectedMessageId(nextMsg.id);
    if (nextMsg.unread) {
      onToggleReadState(nextMsg.id, false);
    }
  };

  const handleSwitchFolder = (folderId: string) => {
    setActiveFolder(folderId);
    setVisibleListCount(100);
    setIsMobileReaderOpen(false);
    setIsDesktopExpanded(false);
    setMobileMenuOpen(false);
  };

  const handleOpenCompose = () => {
    setMobileMenuOpen(false);
    setIsComposeOpen(true);
  };

  const handleConfirmPermanentAction = async () => {
    if (!pendingConfirm) return;
    const action = pendingConfirm;
    setPendingConfirm(null);
    if (action.type === 'delete_forever') {
      await onDeleteForeverMessage(action.message);
    } else if (action.type === 'empty_trash') {
      await onEmptyTrash();
    }
  };

  // Automatically hydrate full HTML body & attachments on demand when an email is clicked/opened
  useEffect(() => {
    if (selectedMessage && selectedMessage.fullBodyLoaded === false) {
      onEnsureFullMessage(selectedMessage);
    }
  }, [selectedMessage, onEnsureFullMessage]);

  const visibleMessages = useMemo(
    () => filteredMessages.slice(0, visibleListCount),
    [filteredMessages, visibleListCount]
  );

  // Keyboard shortcuts: Escape closes expanded/mobile reader, Up/Down navigates emails
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isComposeOpen || pendingConfirm) return;
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isTyping) return;

      if (e.key === 'Escape') {
        if (isDesktopExpanded) {
          setIsDesktopExpanded(false);
        } else if (isMobileReaderOpen) {
          setIsMobileReaderOpen(false);
        }
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        if (selectedIndex >= 0 && selectedIndex < filteredMessages.length - 1) {
          e.preventDefault();
          const nextMsg = filteredMessages[selectedIndex + 1];
          setSelectedMessageId(nextMsg.id);
          if (nextMsg.unread) onToggleReadState(nextMsg.id, false);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        if (selectedIndex > 0) {
          e.preventDefault();
          const prevMsg = filteredMessages[selectedIndex - 1];
          setSelectedMessageId(prevMsg.id);
          if (prevMsg.unread) onToggleReadState(prevMsg.id, false);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    filteredMessages,
    isComposeOpen,
    isDesktopExpanded,
    isMobileReaderOpen,
    onToggleReadState,
    pendingConfirm,
    selectedIndex,
  ]);

  const renderProviderIcon = () => {
    if (account.provider === 'gmail') return <GoogleGIcon className="w-4 h-4 shrink-0" />;
    if (account.provider === 'outlook') return <OutlookIcon className="w-4 h-4 shrink-0" />;
    if (account.provider === 'yahoo') return <YahooIcon className="w-4 h-4 shrink-0" />;
    return <Mail className="w-4 h-4 text-blue-700 shrink-0" />;
  };

  const isSyncBusy = isFetchingMail || isClassifying;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64 shrink-0">
      {/* Brand Header */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <span
          className="text-base font-bold tracking-tight text-slate-950 whitespace-nowrap"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          NexaMAIL
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1 text-slate-500 hover:text-slate-900"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Connected Account Summary */}
      <div className="px-5 py-3.5 border-b border-slate-200 space-y-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {renderProviderIcon()}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-950 truncate">
              {account.displayName}
            </div>
            <div className="text-[11px] font-mono text-slate-500 truncate">{account.email}</div>
          </div>
        </div>
      </div>

      {/* Prominent Compose Button above Mailboxes */}
      <div className="px-3 pt-4 pb-1 shrink-0">
        <button
          type="button"
          onClick={handleOpenCompose}
          className="w-full h-10 px-3.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
        >
          <PenSquare className="w-4 h-4 shrink-0" />
          <span>Compose</span>
        </button>
      </div>

      {/* Mailboxes List */}
      <nav className="flex-1 overflow-y-auto mail-scroll px-3 py-3 space-y-1">
        <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-slate-500">Mailboxes</div>

        <button
          type="button"
          onClick={() => handleSwitchFolder('all')}
          className={`w-full px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 text-sm transition-colors cursor-pointer ${
            activeFolder === 'all'
              ? 'bg-slate-100 text-slate-950 font-semibold'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 font-medium'
          }`}
        >
          <span className="flex items-center gap-2.5 truncate">
            <Inbox className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="truncate">All Mail</span>
          </span>
          <span className="font-mono tabular-nums text-xs text-slate-500">
            {folderCounts.all || 0}
          </span>
        </button>

        {rules.map((rule) => {
          const active = activeFolder === rule.id;
          return (
            <button
              key={rule.id}
              type="button"
              onClick={() => handleSwitchFolder(rule.id)}
              className={`w-full px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 text-sm transition-colors cursor-pointer ${
                active
                  ? 'bg-slate-100 text-slate-950 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 font-medium'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-2 h-2 rounded-[2px] shrink-0 ${ACCENT_DOT_CLASS[rule.accent]}`}
                  aria-hidden="true"
                />
                <span className="truncate">{rule.name}</span>
              </span>
              <span className="font-mono tabular-nums text-xs text-slate-500 shrink-0">
                {folderCounts[rule.id] || 0}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => handleSwitchFolder('general')}
          className={`w-full px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 text-sm transition-colors cursor-pointer ${
            activeFolder === 'general'
              ? 'bg-slate-100 text-slate-950 font-semibold'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 font-medium'
          }`}
        >
          <span className="flex items-center gap-2.5 truncate">
            <Mail className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">General Inbox</span>
          </span>
          <span className="font-mono tabular-nums text-xs text-slate-500">
            {folderCounts.general || 0}
          </span>
        </button>

        {/* Trash Folder at the bottom of Mailboxes */}
        <div className="pt-2 mt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => handleSwitchFolder('trash')}
            className={`w-full px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 text-sm transition-colors cursor-pointer ${
              activeFolder === 'trash'
                ? 'bg-slate-100 text-slate-950 font-semibold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 font-medium'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Trash2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">Trash</span>
            </span>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              {folderCounts.trash || 0}
            </span>
          </button>
        </div>
      </nav>

      {/* Share & Sign Out Footer */}
      <div className="p-3 border-t border-slate-200 space-y-1">
        <button
          type="button"
          onClick={handleCopyCampusLink}
          className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-xs font-medium text-slate-600 hover:text-slate-950 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          {copiedCampusLink ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="text-emerald-700">Campus link copied</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              <span>Copy campus link</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-xs font-medium text-slate-600 hover:text-slate-950 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex h-full">{sidebarContent}</div>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="relative z-50 h-full">{sidebarContent}</div>
          <div
            className="flex-1 bg-slate-950/30"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Clean Contextual Workspace Header — Single Sync Inbox Button */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-950 rounded-md hover:bg-slate-100"
              aria-label="Open mailboxes"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline">Inbox</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-950 truncate">{activeFolderLabel}</span>
            </div>
          </div>

          <div className="flex-1 max-w-md hidden md:block">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sender, subject, or content..."
                className="w-full h-9 pl-9 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {syncProgress.isRunning && (
              <button
                type="button"
                onClick={onStopSync}
                className="h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={onSyncInbox}
              disabled={isSyncBusy}
              className="h-9 px-3.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncBusy ? 'animate-spin' : ''}`} />
              <span>{isSyncBusy ? 'Syncing...' : 'Sync Inbox'}</span>
            </button>
          </div>
        </header>

        {/* Subtle non-blocking Gmail reconnect banner when 1-hour OAuth token expired */}
        {needsGmailReconnect && !statusMessage && !errorMessage && (
          <div
            role="status"
            className="px-4 lg:px-6 py-2 bg-slate-100 border-b border-slate-200 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0"
          >
            <span>Showing saved inbox — reconnect Gmail to sync new mail.</span>
            <button
              type="button"
              onClick={onReconnectGmail}
              disabled={isSyncBusy}
              className="font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              Reconnect Gmail
            </button>
          </div>
        )}

        {/* Friendly Rate-Limit / Sync Status Strip */}
        {statusMessage && (
          <div
            role="status"
            className="px-4 lg:px-6 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center gap-2 shrink-0"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Friendly Error Banner (only for auth expiration / real failures) */}
        {errorMessage && (
          <div
            role="alert"
            className="px-6 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-900 flex flex-wrap items-center justify-between gap-4 shrink-0"
          >
            <span className="leading-relaxed">{errorMessage}</span>
            <div className="flex items-center gap-3 shrink-0">
              {account.provider === 'gmail' && (
                <button
                  type="button"
                  onClick={() => void onReauthorizeGmail()}
                  className="font-semibold text-blue-800 underline whitespace-nowrap cursor-pointer"
                >
                  Re-authorize Gmail
                </button>
              )}
              <button
                type="button"
                onClick={onSyncInbox}
                className="font-semibold underline whitespace-nowrap cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Responsive Split / Full-Screen Workspace: Mail List + Email Reader */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Center Column: Mail List */}
          <section
            className={`${
              isMobileReaderOpen && selectedMessage ? 'hidden' : 'flex'
            } ${
              isDesktopExpanded && selectedMessage ? 'md:hidden' : 'md:flex'
            } w-full md:w-[370px] xl:w-[410px] bg-white border-r border-slate-200 flex-col min-h-0 shrink-0`}
          >
            {/* Filter sub-bar (with Empty Trash action when viewing Trash) */}
            <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              {activeFolder === 'trash' ? (
                <>
                  <span className="text-xs font-mono tabular-nums text-slate-600">
                    {filteredMessages.length} in Trash
                  </span>
                  {folderCounts.trash > 0 && (
                    <button
                      type="button"
                      disabled={isEmptyingTrash}
                      onClick={() =>
                        setPendingConfirm({ type: 'empty_trash', count: folderCounts.trash })
                      }
                      className="h-7 px-2.5 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isEmptyingTrash ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Emptying...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3 h-3" />
                          <span>Empty Trash</span>
                        </>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                    <button
                      type="button"
                      onClick={() => setUnreadOnly(false)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                        !unreadOnly ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnreadOnly(true)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                        unreadOnly ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      Unread
                    </button>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {filteredMessages.length} messages
                  </span>
                </>
              )}
            </div>

            {/* Mobile search input */}
            <div className="p-3 border-b border-slate-200 md:hidden">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search emails..."
                  className="w-full h-9 pl-9 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>
            </div>

            {/* Scrollable Email List */}
            <div className="flex-1 overflow-y-auto mail-scroll divide-y divide-slate-100">
              {isFetchingMail && messages.length === 0 ? (
                <div className="divide-y divide-slate-100">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <div key={idx} className="px-4 py-3.5 space-y-2 animate-pulse">
                      <div className="flex justify-between gap-4">
                        <div className="h-3.5 w-32 bg-slate-200 rounded" />
                        <div className="h-3 w-12 bg-slate-100 rounded" />
                      </div>
                      <div className="h-3.5 w-3/4 bg-slate-200 rounded" />
                      <div className="h-3 w-full bg-slate-100 rounded" />
                    </div>
                  ))}
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="px-6 py-14 text-center space-y-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {activeFolder === 'trash'
                      ? 'Trash is empty'
                      : `No emails in ${activeFolderLabel}`}
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                    {activeFolder === 'trash'
                      ? 'Deleted emails appear here until you restore them or delete them forever.'
                      : messages.length === 0
                      ? 'Sync your inbox to load recent messages and categorize them automatically.'
                      : 'No messages currently match this mailbox or search filter.'}
                  </p>
                  {activeFolder !== 'trash' && (
                    <div className="pt-2 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={onSyncInbox}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                      >
                        Sync Inbox
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {visibleMessages.map((msg) => {
                    const isSelected = selectedMessage?.id === msg.id;
                    const trashed = isMessageTrashed(msg);
                    const matchedRule = getRuleById(msg.classification?.categoryId);
                    const attachmentCount = msg.attachments?.filter((a) => a.filename).length || 0;
                    const cleanFrom = decodeHtmlEntities(msg.fromName || msg.fromEmail);
                    const cleanSubject = decodeHtmlEntities(msg.subject || '(No Subject)');
                    const cleanSnippet = decodeHtmlEntities(msg.snippet || '');

                    return (
                      <div
                        key={msg.id}
                        className={`group relative transition-colors ${
                          isSelected ? 'bg-slate-100/90' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenMessage(msg, false)}
                          onDoubleClick={() => handleOpenMessage(msg, true)}
                          className="w-full text-left px-4 py-3.5 cursor-pointer block pr-10"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span
                              className={`text-sm truncate ${
                                msg.unread
                                  ? 'font-bold text-slate-950'
                                  : 'font-medium text-slate-800'
                              }`}
                            >
                              {cleanFrom}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                              {formatShortDate(msg.dateIso)}
                            </span>
                          </div>

                          <div
                            className={`mt-0.5 text-xs truncate ${
                              msg.unread
                                ? 'font-semibold text-slate-900'
                                : 'font-normal text-slate-700'
                            }`}
                          >
                            {cleanSubject}
                          </div>

                          <p className="mt-1 text-xs text-slate-500 line-clamp-1">{cleanSnippet}</p>

                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap">
                            {trashed ? (
                              <span className="font-medium text-slate-500">Trash</span>
                            ) : matchedRule ? (
                              <span
                                className={`font-semibold ${ACCENT_TEXT_CLASS[matchedRule.accent]}`}
                              >
                                {matchedRule.shortName}
                              </span>
                            ) : (
                              <span className="font-medium text-slate-500">General</span>
                            )}
                            {attachmentCount > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 text-slate-600">
                                  <Paperclip className="w-3 h-3 shrink-0" />
                                  <span className="font-mono tabular-nums">{attachmentCount}</span>
                                </span>
                              </>
                            )}
                          </div>
                        </button>

                        {/* Subtle hover Delete icon on each non-trashed email row */}
                        {!trashed && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onTrashMessage(msg);
                            }}
                            disabled={busyActionMessageId === msg.id}
                            title="Move to Trash"
                            aria-label={`Delete ${cleanSubject}`}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-rose-700 hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {filteredMessages.length > visibleMessages.length && (
                    <div className="p-3 text-center bg-slate-50/70">
                      <button
                        type="button"
                        onClick={() => setVisibleListCount((c) => c + 150)}
                        className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Show more ({visibleMessages.length.toLocaleString()} of{' '}
                        {filteredMessages.length.toLocaleString()})
                      </button>
                    </div>
                  )}

                  {/* Subtle Load Older Mail button at the bottom of the email list */}
                  {activeFolder !== 'trash' && syncProgress.hasMore && (
                    <div className="p-3.5 text-center bg-slate-50/50">
                      <button
                        type="button"
                        onClick={onLoadOlderMail}
                        disabled={isLoadingOlder || isFetchingMail}
                        className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {isLoadingOlder ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Loading older mail...</span>
                          </>
                        ) : (
                          <span>Load Older Mail</span>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Right Column / Full-Screen Reader View */}
          <main
            className={`${
              isMobileReaderOpen && selectedMessage ? 'flex' : 'hidden md:flex'
            } flex-1 flex-col bg-slate-50 min-w-0 overflow-hidden`}
          >
            {selectedMessage ? (
              <EmailReaderView
                message={selectedMessage}
                rules={rules}
                isTrashed={isMessageTrashed(selectedMessage)}
                currentIndex={selectedIndex}
                totalCount={filteredMessages.length}
                isExpanded={isDesktopExpanded}
                isLoadingFullBody={loadingFullMessageId === selectedMessage.id}
                isReclassifying={reclassifyingMessageId === selectedMessage.id}
                isActionBusy={busyActionMessageId === selectedMessage.id}
                onBackMobile={() => setIsMobileReaderOpen(false)}
                onToggleExpand={() => setIsDesktopExpanded((prev) => !prev)}
                onSelectPrevious={() => handleStepMessage(-1)}
                onSelectNext={() => handleStepMessage(1)}
                onToggleReadState={onToggleReadState}
                onDownloadAttachment={onDownloadAttachment}
                onManualReclassifyMessage={onManualReclassifyMessage}
                onManualMoveMessage={onManualMoveMessage}
                onTrashMessage={(msg) => void onTrashMessage(msg)}
                onRestoreMessage={(msg) => void onRestoreMessage(msg)}
                onDeleteForeverMessage={(msg) =>
                  setPendingConfirm({ type: 'delete_forever', message: msg })
                }
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="max-w-sm space-y-2">
                  <h2 className="text-base font-semibold text-slate-900">Select an email to read</h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Choose any message from the list to read its full content and download
                    attachments.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Floating Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        fromEmail={account.email}
        needsPermissionReauth={needsMailActionScopeReauth}
        onClose={() => setIsComposeOpen(false)}
        onReauthorizeGmail={onReauthorizeGmail}
        onSendEmail={onSendEmail}
      />

      {/* Explicit Confirmation Modal for Delete Forever & Empty Trash */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-2xl p-6 space-y-4">
            <div className="space-y-1.5">
              <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-950">
                {pendingConfirm.type === 'empty_trash'
                  ? `Empty Trash (${pendingConfirm.count} ${
                      pendingConfirm.count === 1 ? 'message' : 'messages'
                    })?`
                  : 'Delete message forever?'}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {pendingConfirm.type === 'empty_trash'
                  ? `This will permanently delete all ${pendingConfirm.count} ${
                      pendingConfirm.count === 1 ? 'email' : 'emails'
                    } in Trash from Gmail and your browser cache. This action cannot be undone.`
                  : `"${decodeHtmlEntities(
                      pendingConfirm.message.subject || '(No Subject)'
                    )}" will be permanently deleted from Gmail and cannot be recovered.`}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="h-9 px-3.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmPermanentAction()}
                className="h-9 px-3.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg cursor-pointer"
              >
                {pendingConfirm.type === 'empty_trash' ? 'Empty Trash' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Floating Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 sm:left-6 sm:translate-x-0 z-50 px-4 py-2.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-lg flex items-center gap-3"
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={onDismissToast}
            className="text-slate-400 hover:text-white cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
