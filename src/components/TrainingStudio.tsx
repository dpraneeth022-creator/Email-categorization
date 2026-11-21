import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { getGmailAccessToken } from '../lib/firebaseAuth';
import type {
  ClassificationRule,
  MailClassification,
  RuleAccent,
  TrainingFeedbackExample,
} from '../shared/types';

interface TrainingStudioProps {
  rules: ClassificationRule[];
  feedbackExamples: TrainingFeedbackExample[];
  initialTab?: 'rules' | 'order' | 'test';
  isAuthenticated: boolean;
  onBack: () => void;
  onUpdateRules: (nextRules: ClassificationRule[]) => void;
  onResetRules: () => void;
  onRemoveFeedback: (id: string) => void;
  onReclassifyInbox?: () => void;
}

interface ParsedOrderPreview {
  action: 'update_existing' | 'create_new';
  targetRuleId: string;
  name: string;
  shortName: string;
  description: string;
  senders: string[];
  keywords: string[];
  useAiSemantics: boolean;
}

const ACCENT_POOL: RuleAccent[] = ['amber', 'violet', 'teal', 'rose', 'blue', 'emerald'];

const TEST_PRESETS = [
  {
    label: 'RVCE Faculty Circular',
    fromEmail: 'dean.academics@rvce.edu.in',
    subject: 'Revised CIE-2 Timetable for Odd Semester',
    bodyText:
      'Dear Students, Please find attached the revised CIE-2 schedule issued by the Office of Dean Academics, RVCE.',
  },
  {
    label: 'MathWorks Grader',
    fromEmail: 'noreply@mail.grader.mathworks.com',
    subject: 'New MATLAB Grader Assignment Posted',
    bodyText:
      'Your instructor has published Problem Set 4 on MATLAB Grader. Submit before Friday 11:59 PM.',
  },
  {
    label: 'NSS Camp Notice',
    fromEmail: 'nss@rvce.edu.in',
    subject: 'Annual Blood Donation & Health Camp',
    bodyText:
      'Join NSS RVCE this Saturday at the quadrangle for our blood donation and community outreach drive.',
  },
  {
    label: 'External Volunteering Call',
    fromEmail: 'outreach@bengalurucares.org',
    subject: 'Call for Weekend Volunteers: Lake Cleanliness Drive',
    bodyText:
      'We are recruiting student volunteers for a Sunday morning lake restoration and plantation drive. Community service certificates provided.',
  },
  {
    label: 'General Promotion',
    fromEmail: 'deals@shopstream.com',
    subject: 'Weekend Flash Sale — 40% off headphones',
    bodyText: 'Upgrade your desk setup today with limited-time discounts across electronics.',
  },
];

export const TrainingStudio: React.FC<TrainingStudioProps> = ({
  rules,
  feedbackExamples,
  initialTab = 'rules',
  isAuthenticated,
  onBack,
  onUpdateRules,
  onResetRules,
  onRemoveFeedback,
  onReclassifyInbox,
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'order' | 'test'>(initialTab);
  const [selectedRuleId, setSelectedRuleId] = useState<string>(rules[0]?.id || 'academic');
  const [senderSearch, setSenderSearch] = useState('');
  const [newSenderInput, setNewSenderInput] = useState('');
  const [newKeywordInput, setNewKeywordInput] = useState('');

  // Natural-language training order state
  const [orderPrompt, setOrderPrompt] = useState('');
  const [isParsingOrder, setIsParsingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderPreview, setOrderPreview] = useState<ParsedOrderPreview | null>(null);
  const [orderAppliedNotice, setOrderAppliedNotice] = useState<string | null>(null);

  // Live Gemini test bench state
  const [testFrom, setTestFrom] = useState(TEST_PRESETS[3].fromEmail);
  const [testSubject, setTestSubject] = useState(TEST_PRESETS[3].subject);
  const [testBody, setTestBody] = useState(TEST_PRESETS[3].bodyText);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<MailClassification | null>(null);

  const selectedRule = useMemo(
    () => rules.find((r) => r.id === selectedRuleId) || rules[0],
    [rules, selectedRuleId]
  );

  const filteredSenders = useMemo(() => {
    if (!selectedRule) return [];
    const q = senderSearch.trim().toLowerCase();
    if (!q) return selectedRule.senders;
    return selectedRule.senders.filter((s) => s.toLowerCase().includes(q));
  }, [selectedRule, senderSearch]);

  const handleAddSenders = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRule || !newSenderInput.trim()) return;
    const entries = newSenderInput
      .split(/[\s,;]+/)
      .map((item) => item.trim().toLowerCase().replace(/,in$/i, '.in'))
      .filter(Boolean);
    if (entries.length === 0) return;

    const merged = Array.from(new Set([...selectedRule.senders, ...entries]));
    const updated = rules.map((r) => (r.id === selectedRule.id ? { ...r, senders: merged } : r));
    onUpdateRules(updated);
    setNewSenderInput('');
  };

  const handleRemoveSender = (senderToRemove: string) => {
    if (!selectedRule) return;
    const updated = rules.map((r) =>
      r.id === selectedRule.id
        ? { ...r, senders: r.senders.filter((s) => s !== senderToRemove) }
        : r
    );
    onUpdateRules(updated);
  };

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRule || !newKeywordInput.trim()) return;
    const entries = newKeywordInput
      .split(/[,;\n]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (entries.length === 0) return;

    const merged = Array.from(new Set([...selectedRule.keywords, ...entries]));
    const updated = rules.map((r) => (r.id === selectedRule.id ? { ...r, keywords: merged } : r));
    onUpdateRules(updated);
    setNewKeywordInput('');
  };

  const handleRemoveKeyword = (kwToRemove: string) => {
    if (!selectedRule) return;
    const updated = rules.map((r) =>
      r.id === selectedRule.id
        ? { ...r, keywords: r.keywords.filter((k) => k !== kwToRemove) }
        : r
    );
    onUpdateRules(updated);
  };

  const handleToggleSemantics = () => {
    if (!selectedRule) return;
    const updated = rules.map((r) =>
      r.id === selectedRule.id ? { ...r, useAiSemantics: !r.useAiSemantics } : r
    );
    onUpdateRules(updated);
  };

  const handleDeleteCustomRule = (ruleId: string) => {
    const next = rules.filter((r) => r.id !== ruleId);
    onUpdateRules(next);
    if (selectedRuleId === ruleId && next[0]) {
      setSelectedRuleId(next[0].id);
    }
  };

  const handleParseOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderPrompt.trim()) return;
    setIsParsingOrder(true);
    setOrderError(null);
    setOrderPreview(null);
    setOrderAppliedNotice(null);

    try {
      const token = getGmailAccessToken();
      const res = await fetch('/api/rules/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          instruction: orderPrompt,
          existingRules: rules,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not parse training order.');
      }
      setOrderPreview(data.parsedRule);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Failed to parse order.');
    } finally {
      setIsParsingOrder(false);
    }
  };

  const handleApplyOrder = () => {
    if (!orderPreview) return;

    const cleanSenders = Array.from(
      new Set(
        (orderPreview.senders || [])
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      )
    );
    const cleanKeywords = Array.from(
      new Set(
        (orderPreview.keywords || [])
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const existing = rules.find((r) => r.id === orderPreview.targetRuleId);

    if (orderPreview.action === 'update_existing' && existing) {
      const updated = rules.map((r) =>
        r.id === existing.id
          ? {
              ...r,
              description: orderPreview.description || r.description,
              senders: Array.from(new Set([...r.senders, ...cleanSenders])),
              keywords: Array.from(new Set([...r.keywords, ...cleanKeywords])),
              useAiSemantics: r.useAiSemantics || orderPreview.useAiSemantics,
            }
          : r
      );
      onUpdateRules(updated);
      setSelectedRuleId(existing.id);
      setOrderAppliedNotice(`Updated ${existing.name} with your training order.`);
    } else {
      const slugBase =
        orderPreview.targetRuleId
          ?.toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-|-$/g, '') || `custom-${Date.now()}`;
      const uniqueId = rules.some((r) => r.id === slugBase) ? `${slugBase}-${Date.now()}` : slugBase;
      const newRule: ClassificationRule = {
        id: uniqueId,
        name: (orderPreview.name || slugBase).toUpperCase(),
        shortName: orderPreview.shortName || orderPreview.name || 'Custom',
        description: orderPreview.description || 'User-trained mailbox category.',
        accent: ACCENT_POOL[rules.length % ACCENT_POOL.length],
        senders: cleanSenders,
        keywords: cleanKeywords,
        useAiSemantics: orderPreview.useAiSemantics,
        isSystemDefault: false,
      };
      onUpdateRules([...rules, newRule]);
      setSelectedRuleId(newRule.id);
      setOrderAppliedNotice(`Created mailbox "${newRule.name}" and added it to the active model.`);
    }

    setOrderPreview(null);
    setOrderPrompt('');
  };

  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true);
    setTestError(null);
    setTestResult(null);

    try {
      const token = getGmailAccessToken();
      const res = await fetch('/api/classify/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fromEmail: testFrom,
          subject: testSubject,
          bodyText: testBody,
          rules,
          feedbackExamples,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Classification test failed.');
      }
      setTestResult(data.classification);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Failed to test classifier.');
    } finally {
      setIsTesting(false);
    }
  };

  const getCategoryLabel = (categoryId: string) => {
    if (categoryId === 'general') return 'GENERAL INBOX';
    return rules.find((r) => r.id === categoryId)?.name || categoryId.toUpperCase();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Contextual Top Bar */}
      <header className="bg-white border-b border-slate-200 px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            {isAuthenticated ? 'Back to Inbox' : 'Back to Sign In'}
          </button>
          <span className="text-slate-300" aria-hidden="true">/</span>
          <h1 className="text-base font-bold text-slate-950 truncate">
            Classifier Rules &amp; Model Training
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isAuthenticated && onReclassifyInbox && (
            <button
              type="button"
              onClick={() => {
                onReclassifyInbox();
                onBack();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Re-classify Connected Inbox
            </button>
          )}
          <button
            type="button"
            onClick={onResetRules}
            className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-950 border border-slate-200 hover:border-slate-300 bg-white rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
        </div>
      </header>

      <div className="max-w-[1280px] w-full mx-auto px-6 lg:px-8 py-8 space-y-6">
        {/* Segmented Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'rules'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Trained Mailboxes ({rules.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('order')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'order'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Give New Training Order
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('test')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'test'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Live Gemini Test Bench
            </button>
          </div>

          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {rules.reduce((sum, r) => sum + r.senders.length, 0)} directory senders ·{' '}
            {feedbackExamples.length} feedback examples
          </div>
        </div>

        {/* TAB 1: Trained Mailboxes & Senders */}
        {activeTab === 'rules' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Mailbox selector list */}
            <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
              {rules.map((rule) => {
                const isSelected = rule.id === selectedRule?.id;
                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => {
                      setSelectedRuleId(rule.id);
                      setSenderSearch('');
                    }}
                    className={`w-full text-left px-5 py-4 transition-colors cursor-pointer ${
                      isSelected ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          isSelected ? 'text-blue-700' : 'text-slate-900'
                        }`}
                      >
                        {rule.name}
                      </span>
                      <span className="font-mono tabular-nums text-xs text-slate-500">
                        {rule.senders.length} senders
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {rule.description}
                    </p>
                    <div className="mt-2 text-[11px] text-slate-500">
                      <span>{rule.useAiSemantics ? 'Directory + Gemini AI' : 'Exact Directory'}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{rule.keywords.length} keywords</span>
                    </div>
                  </button>
                );
              })}

              {feedbackExamples.length > 0 && (
                <div className="p-5 bg-slate-50/60 space-y-3">
                  <div className="text-xs font-semibold text-slate-800">
                    Learned Corrections ({feedbackExamples.length})
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto mail-scroll">
                    {feedbackExamples.map((fb) => (
                      <div
                        key={fb.id}
                        className="flex items-start justify-between gap-2 text-xs text-slate-600 py-1.5 border-b border-slate-200 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] text-slate-800 truncate">
                            {fb.fromEmail}
                          </div>
                          <div className="truncate">{fb.subject}</div>
                          <div className="text-[11px] text-blue-700 font-medium">
                            → {getCategoryLabel(fb.assignedCategoryId)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveFeedback(fb.id)}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                          title="Remove feedback example"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            {/* Selected Mailbox Editor */}
            {selectedRule && (
              <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-slate-950">{selectedRule.name}</h2>
                    <p className="text-sm text-slate-600 max-w-2xl">{selectedRule.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedRule.useAiSemantics}
                        onChange={handleToggleSemantics}
                        className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      Enable Gemini Semantic Analysis
                    </label>
                    {!selectedRule.isSystemDefault && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomRule(selectedRule.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-700 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Box
                      </button>
                    )}
                  </div>
                </div>

                {/* Semantic Keywords Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Semantic Keywords &amp; Topic Signals ({selectedRule.keywords.length})
                    </h3>
                    <span className="text-xs text-slate-500">
                      Used by Gemini to match email subject and body meaning
                    </span>
                  </div>

                  <form onSubmit={handleAddKeyword} className="flex gap-2">
                    <input
                      type="text"
                      value={newKeywordInput}
                      onChange={(e) => setNewKeywordInput(e.target.value)}
                      placeholder="Add comma-separated keywords (e.g., social drive, relief camp)"
                      className="flex-1 h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                    <button
                      type="submit"
                      className="h-9 px-3.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Keywords
                    </button>
                  </form>

                  {selectedRule.keywords.length > 0 ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1 text-xs text-slate-700">
                      {selectedRule.keywords.map((kw) => (
                        <span key={kw} className="inline-flex items-center gap-1.5">
                          <span className="font-mono text-slate-800">{kw}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyword(kw)}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label={`Remove keyword ${kw}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No semantic keywords configured.</p>
                  )}
                </div>

                {/* Senders Directory Section */}
                <div className="pt-5 border-t border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Trained Sender Directory ({selectedRule.senders.length})
                    </h3>
                    <div className="relative w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={senderSearch}
                        onChange={(e) => setSenderSearch(e.target.value)}
                        placeholder="Filter sender address..."
                        className="w-full h-8 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <form onSubmit={handleAddSenders} className="flex gap-2">
                    <input
                      type="text"
                      value={newSenderInput}
                      onChange={(e) => setNewSenderInput(e.target.value)}
                      placeholder="Add email addresses or domains (space or comma separated)"
                      className="flex-1 h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                    <button
                      type="submit"
                      className="h-9 px-3.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Senders
                    </button>
                  </form>

                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[340px] overflow-y-auto mail-scroll">
                    {filteredSenders.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-slate-500">
                        No senders match "{senderSearch}".
                      </div>
                    ) : (
                      filteredSenders.map((sender) => (
                        <div
                          key={sender}
                          className="px-4 py-2 flex items-center justify-between text-xs hover:bg-slate-50"
                        >
                          <span className="font-mono text-slate-800">{sender}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSender(sender)}
                            className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                            title={`Remove ${sender}`}
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: Natural-Language Training Order */}
        {activeTab === 'order' && (
          <div className="max-w-3xl bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-slate-950">Give NexaMAIL a new sorting order</h2>
              <p className="text-sm text-slate-600">
                Describe your next rule in plain English—paste new email lists, domains, or topics.
                Gemini parses your instruction into a verified mailbox rule that you can review
                before applying.
              </p>
            </div>

            {orderAppliedNotice && (
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{orderAppliedNotice}</span>
              </div>
            )}

            {orderError && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                {orderError}
              </div>
            )}

            <form onSubmit={handleParseOrder} className="space-y-4">
              <textarea
                rows={5}
                value={orderPrompt}
                onChange={(e) => setOrderPrompt(e.target.value)}
                placeholder="Example: Classify mails from ieee@rvce.edu.in, codingclub@rvce.edu.in and emails mentioning hackathon, workshop, or coding contest into TECH & CLUB MAILS"
                className="w-full p-3.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 leading-relaxed"
              />
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-slate-500">
                  Supports creating new mailboxes or expanding Academic &amp; Volunteering rules.
                </span>
                <button
                  type="submit"
                  disabled={isParsingOrder || !orderPrompt.trim()}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isParsingOrder ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Parsing Order...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Parse &amp; Preview Order
                    </>
                  )}
                </button>
              </div>
            </form>

            {orderPreview && (
              <div className="pt-6 border-t border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-blue-700">
                      {orderPreview.action === 'update_existing'
                        ? 'Update Existing Mailbox'
                        : 'Create New Mailbox'}
                    </div>
                    <h3 className="text-base font-bold text-slate-950">{orderPreview.name}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyOrder}
                    className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Apply to Model
                  </button>
                </div>

                <p className="text-sm text-slate-600">{orderPreview.description}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="font-semibold text-slate-900">
                      Extracted Senders ({orderPreview.senders.length})
                    </div>
                    <div className="font-mono text-slate-700 break-all">
                      {orderPreview.senders.length > 0 ? orderPreview.senders.join(', ') : 'None'}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="font-semibold text-slate-900">
                      Semantic Keywords ({orderPreview.keywords.length})
                    </div>
                    <div className="font-mono text-slate-700">
                      {orderPreview.keywords.length > 0 ? orderPreview.keywords.join(', ') : 'None'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Live Gemini Classifier Test Bench */}
        {activeTab === 'test' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleRunTest}
              className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
            >
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-950">Test Email Classification</h2>
                <p className="text-xs text-slate-500">
                  Verify exact RVCE directory matching and Gemini semantic volunteering detection on
                  any sample email.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {TEST_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTestFrom(preset.fromEmail);
                      setTestSubject(preset.subject);
                      setTestBody(preset.bodyText);
                      setTestResult(null);
                      setTestError(null);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Sender Address (From)
                  </label>
                  <input
                    type="text"
                    value={testFrom}
                    onChange={(e) => setTestFrom(e.target.value)}
                    placeholder="e.g. hod.cse@rvce.edu.in or outreach@ngo.org"
                    className="w-full h-9 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={testSubject}
                    onChange={(e) => setTestSubject(e.target.value)}
                    placeholder="Email subject line"
                    className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Body
                  </label>
                  <textarea
                    rows={5}
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
                    placeholder="Paste email body content to test semantic analysis..."
                    className="w-full p-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isTesting}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Classifying with Gemini...
                  </>
                ) : (
                  'Run Classification Test'
                )}
              </button>
            </form>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Classification Output</h3>

              {testError && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                  {testError}
                </div>
              )}

              {!testResult && !testError && !isTesting && (
                <p className="text-sm text-slate-500 leading-relaxed">
                  Choose a preset or enter any sender, subject, and body on the left to see which
                  mailbox NexaMAIL routes it into.
                </p>
              )}

              {isTesting && (
                <div className="space-y-3 animate-pulse">
                  <div className="h-5 w-40 bg-slate-200 rounded" />
                  <div className="h-4 w-full bg-slate-100 rounded" />
                  <div className="h-4 w-3/4 bg-slate-100 rounded" />
                </div>
              )}

              {testResult && (
                <div className="space-y-4">
                  <div className="pb-4 border-b border-slate-200 space-y-1">
                    <div className="text-xs text-slate-500">Assigned Mailbox</div>
                    <div
                      className={`text-xl font-bold ${
                        testResult.categoryId === 'volunteering'
                          ? 'text-emerald-700'
                          : testResult.categoryId === 'academic'
                          ? 'text-blue-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {getCategoryLabel(testResult.categoryId)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="text-slate-500">Match Engine</div>
                      <div className="mt-0.5 font-medium text-slate-900">
                        {testResult.matchedBy === 'directory'
                          ? 'Trained Sender Directory'
                          : 'Gemini Semantic Model'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Confidence</div>
                      <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
                        {Math.round(testResult.confidence * 100)}%
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <div className="text-xs text-slate-500 mb-1">Reasoning</div>
                    <p className="text-sm text-slate-800 leading-relaxed">{testResult.reason}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
