import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Inbox,
  Loader2,
  LogOut,
  Mail,
  Menu,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Share2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { SyncProgressState } from '../App';
import type {
  ClassificationRule,
  ConnectedAccount,
  MailAttachment,
  MailMessage,
  RuleAccent,
} from '../shared/types';
import { EmailReaderView } from './EmailReaderView';
import { GoogleGIcon, OutlookIcon, YahooIcon } from './ProviderIcons';

interface MailWorkspaceProps {
  account: ConnectedAccount;
  messages: MailMessage[];
  rules: ClassificationRule[];
  isFetchingMail: boolean;
  isClassifying: boolean;
  syncProgress: SyncProgressState;
  loadingFullMessageId: string | null;
  errorMessage: string | null;
  onSyncMail: () => void;
  onStopSync: () => void;
  onResumeSync: () => void;
  onSyncRvceMail?: () => void;
  onRunClassify: () => void;
  onReauthorizeGmail?: () => void;
  onSignOut: () => void;
  onOpenTraining: (tab?: 'rules' | 'order' | 'test') => void;
  onReassignMessage: (
    message: MailMessage,
    newCategoryId: string,
    addSenderToDirectory: boolean
  ) => void;
  onToggleReadState: (messageId: string, unread: boolean) => void;
  onDownloadAttachment: (message: MailMessage, attachment: MailAttachment) => Promise<void>;
  onEnsureFullMessage: (message: MailMessage) => void;
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
  isClassifying,
  syncProgress,
  loadingFullMessageId,
  errorMessage,
  onSyncMail,
  onStopSync,
  onResumeSync,
  onSyncRvceMail,
  onRunClassify,
  onReauthorizeGmail,
  onSignOut,
  onOpenTraining,
  onReassignMessage,
  onToggleReadState,
  onDownloadAttachment,
  onEnsureFullMessage,
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

  const isInternalPreviewContainer =
    typeof window !== 'undefined' && /^https?:\/\/ais-(dev|pre)-/i.test(window.location.origin);

  const handleCopyCampusLink = async () => {
    if (typeof window === 'undefined' || !window.location?.origin || isInternalPreviewContainer) {
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedCampusLink(true);
      setTimeout(() => setCopiedCampusLink(false), 2000);
    } catch {
      // Clipboard blocked in sandboxed frame
    }
  };

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: messages.length,
      general: 0,
    };
    for (const rule of rules) {
      counts[rule.id] = 0;
    }
    for (const msg of messages) {
      const cat = msg.classification?.categoryId || 'general';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [messages, rules]);

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return messages.filter((msg) => {
      const cat = msg.classification?.categoryId || 'general';
      if (activeFolder !== 'all' && cat !== activeFolder) return false;
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

  // Automatically hydrate full HTML body & attachments whenever an email is selected/opened
  useEffect(() => {
    if (selectedMessage && selectedMessage.fullBodyLoaded === false) {
      onEnsureFullMessage(selectedMessage);
    }
  }, [selectedMessage, onEnsureFullMessage]);

  const visibleMessages = useMemo(
    () => filteredMessages.slice(0, visibleListCount),
    [filteredMessages, visibleListCount]
  );

  const classifiedTotal = useMemo(
    () => messages.filter((m) => Boolean(m.classification)).length,
    [messages]
  );

  // Keyboard shortcuts: Escape closes expanded/mobile reader, Up/Down navigates emails
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
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
  }, [filteredMessages, isDesktopExpanded, isMobileReaderOpen, onToggleReadState, selectedIndex]);

  const renderProviderIcon = () => {
    if (account.provider === 'gmail') return <GoogleGIcon className="w-4 h-4 shrink-0" />;
    if (account.provider === 'outlook') return <OutlookIcon className="w-4 h-4 shrink-0" />;
    if (account.provider === 'yahoo') return <YahooIcon className="w-4 h-4 shrink-0" />;
    return <Mail className="w-4 h-4 text-blue-700 shrink-0" />;
  };

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
      <div className="px-5 py-4 border-b border-slate-200 space-y-2.5">
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

      {/* Mailboxes List */}
      <nav className="flex-1 overflow-y-auto mail-scroll px-3 py-4 space-y-6">
        <div className="space-y-1">
          <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-slate-500">
            Mailboxes
          </div>

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
        </div>

        {/* Classifier & Training Navigation */}
        <div className="pt-4 border-t border-slate-200 space-y-1">
          <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-slate-500">
            AI Classification
          </div>
          <button
            type="button"
            onClick={() => {
              onOpenTraining('rules');
              setMobileMenuOpen(false);
            }}
            className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="truncate">Rules &amp; Senders</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenTraining('order');
              setMobileMenuOpen(false);
            }}
            className="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50/70 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate">New Training Order</span>
          </button>
        </div>
      </nav>

      {/* Share & Sign Out Footer */}
      <div className="p-3 border-t border-slate-200 space-y-1">
        {!isInternalPreviewContainer && (
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
        )}
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
        {/* Contextual Workspace Header */}
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
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
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
            {onSyncRvceMail && (
              <button
                type="button"
                onClick={onSyncRvceMail}
                disabled={isFetchingMail}
                className="h-9 px-3 text-xs font-medium text-blue-700 bg-blue-50/70 border border-blue-200 hover:bg-blue-100/70 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                title="Fetch all RVCE, MathWorks, NSS, NCC, and volunteering messages directly from Gmail"
              >
                <span>Fetch RVCE Mails</span>
              </button>
            )}

            <button
              type="button"
              onClick={onSyncMail}
              disabled={isFetchingMail}
              className="h-9 px-3.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingMail ? 'animate-spin' : ''}`} />
              <span>{isFetchingMail ? 'Syncing...' : 'Sync All'}</span>
            </button>

            <button
              type="button"
              onClick={onRunClassify}
              disabled={isClassifying || messages.length === 0}
              className="h-9 px-3.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {isClassifying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Classifying...</span>
                </>
              ) : (
                <span>Classify</span>
              )}
            </button>
          </div>
        </header>

        {/* Full-Mailbox Sync & Categorization Progress Strip */}
        {(syncProgress.isRunning || (!syncProgress.isRunning && syncProgress.hasMore)) && (
          <div className="px-4 lg:px-6 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 text-slate-700 min-w-0">
              {syncProgress.isRunning && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700 shrink-0" />
              )}
              <span className="font-medium text-slate-900 truncate">
                {syncProgress.isRunning
                  ? syncProgress.phaseLabel || 'Syncing & categorizing all mail'
                  : 'Mailbox sync paused'}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="font-mono tabular-nums text-slate-600 whitespace-nowrap">
                {messages.length.toLocaleString()} loaded
                {syncProgress.totalEstimate && syncProgress.totalEstimate > messages.length
                  ? ` of ~${syncProgress.totalEstimate.toLocaleString()}`
                  : ''}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="font-mono tabular-nums text-slate-600 whitespace-nowrap">
                {classifiedTotal.toLocaleString()} categorized
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {syncProgress.isRunning ? (
                <button
                  type="button"
                  onClick={onStopSync}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md whitespace-nowrap cursor-pointer transition-colors"
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onResumeSync}
                  className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded-md whitespace-nowrap cursor-pointer transition-colors"
                >
                  Continue Loading Older Mail
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="px-6 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-900 flex flex-wrap items-center justify-between gap-4 shrink-0"
          >
            <span className="leading-relaxed">{errorMessage}</span>
            <div className="flex items-center gap-3 shrink-0">
              {account.provider === 'gmail' && onReauthorizeGmail && (
                <button
                  type="button"
                  onClick={onReauthorizeGmail}
                  className="font-semibold text-blue-800 underline whitespace-nowrap cursor-pointer"
                >
                  Re-authorize Gmail
                </button>
              )}
              <button
                type="button"
                onClick={onSyncMail}
                className="font-semibold underline whitespace-nowrap cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Responsive Split / Full-Screen Workspace: Mail List + Email Reader */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Center Column: Mail List (hidden on mobile when reader is open, hidden on desktop when reader is expanded) */}
          <section
            className={`${
              isMobileReaderOpen && selectedMessage ? 'hidden' : 'flex'
            } ${
              isDesktopExpanded && selectedMessage ? 'md:hidden' : 'md:flex'
            } w-full md:w-[370px] xl:w-[410px] bg-white border-r border-slate-200 flex-col min-h-0 shrink-0`}
          >
            {/* Filter sub-bar */}
            <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
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
                    No emails in {activeFolderLabel}
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                    {messages.length === 0
                      ? 'Sync your mailbox to load recent messages and run automatic Gemini classification.'
                      : 'No fetched messages currently match this mailbox or search filter.'}
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={onSyncMail}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                    >
                      Sync Mail
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenTraining('test')}
                      className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Test Classifier
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {visibleMessages.map((msg) => {
                    const isSelected = selectedMessage?.id === msg.id;
                    const matchedRule = getRuleById(msg.classification?.categoryId);
                    const attachmentCount = msg.attachments?.filter((a) => a.filename).length || 0;

                    return (
                      <button
                        key={msg.id}
                        type="button"
                        onClick={() => handleOpenMessage(msg, false)}
                        onDoubleClick={() => handleOpenMessage(msg, true)}
                        className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer block ${
                          isSelected ? 'bg-slate-100/90' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span
                            className={`text-sm truncate ${
                              msg.unread
                                ? 'font-bold text-slate-950'
                                : 'font-medium text-slate-800'
                            }`}
                          >
                            {msg.fromName}
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
                          {msg.subject}
                        </div>

                        <p className="mt-1 text-xs text-slate-500 line-clamp-1">{msg.snippet}</p>

                        {/* Clean unboxed metadata row (zero pills) */}
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap">
                          {matchedRule ? (
                            <span
                              className={`font-semibold ${ACCENT_TEXT_CLASS[matchedRule.accent]}`}
                            >
                              {matchedRule.shortName}
                            </span>
                          ) : (
                            <span className="font-medium text-slate-500">General</span>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>
                            {msg.classification?.matchedBy === 'directory'
                              ? 'Directory'
                              : msg.classification?.matchedBy === 'user_feedback'
                              ? 'Trained'
                              : msg.classification
                              ? 'Gemini AI'
                              : 'Pending'}
                          </span>
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
                    );
                  })}

                  {filteredMessages.length > visibleMessages.length && (
                    <div className="p-4 text-center bg-slate-50/70">
                      <button
                        type="button"
                        onClick={() => setVisibleListCount((c) => c + 150)}
                        className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Show more ({visibleMessages.length.toLocaleString()} of{' '}
                        {filteredMessages.length.toLocaleString()})
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
                currentIndex={selectedIndex}
                totalCount={filteredMessages.length}
                isExpanded={isDesktopExpanded}
                isLoadingFullBody={loadingFullMessageId === selectedMessage.id}
                onBackMobile={() => setIsMobileReaderOpen(false)}
                onToggleExpand={() => setIsDesktopExpanded((prev) => !prev)}
                onSelectPrevious={() => handleStepMessage(-1)}
                onSelectNext={() => handleStepMessage(1)}
                onToggleReadState={onToggleReadState}
                onReassignMessage={onReassignMessage}
                onDownloadAttachment={onDownloadAttachment}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="max-w-sm space-y-2">
                  <h2 className="text-base font-semibold text-slate-900">Select an email to read</h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Choose any message from the list to inspect its full content, click links,
                    download attachments, or retrain the classifier with one click.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
