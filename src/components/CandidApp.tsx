'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type RefObject,
} from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  accountServiceToCard,
  logoKeyFromLabel,
  type AccountServiceRow,
  type ServiceCardModel,
} from '@/lib/services/account-services';
import {
  callHankAPI,
  detectServiceType,
  serviceProfiles,
  processingMessages,
  ADMIN_VIEW_TITLES,
  MEMBER_VIEW_TITLES,
} from '@/lib/candid-data';

export type CandidSessionUser = { email: string; name?: string | null };

export type CandidAppProps = {
  sessionUser?: CandidSessionUser;
  userId?: string;
  /** From Supabase `profiles.role`: admin shell vs member shell */
  appRole?: 'admin' | 'user';
  signOutAction?: () => Promise<void>;
};

const DEMO_SERVICES: ServiceCardModel[] = [
  { id: 'demo-rc', cls: 'candid-svc', logo: 'ringcentral', logoTxt: 'RC', name: 'UCaaS / Phone System', vendor: 'RingCentral — 25 seats', status: 'expiring', statusTxt: 'Expiring Soon', badge: 'candid', pending: false, amount: '$1,250', exp: 'urgent', expTxt: 'Expires Jun 1, 2026', expSub: '40 days remaining', filter: ['candid', 'expiring'] },
  { id: 'demo-cb', cls: 'candid-svc', logo: 'comcast', logoTxt: 'CB', name: 'Internet Service', vendor: 'Comcast Business — 500 Mbps', status: 'expiring', statusTxt: 'Expiring Soon', badge: 'candid', pending: false, amount: '$420', exp: 'warn', expTxt: 'Expires Jul 15, 2026', expSub: '84 days remaining', filter: ['candid', 'expiring'] },
  { id: 'demo-sq', cls: 'candid-svc', logo: 'square', logoTxt: 'SQ', name: 'Merchant Processing', vendor: 'Square — Effective rate 3.1%', status: 'active', statusTxt: 'Active', badge: 'candid', pending: false, amount: '$1,954', exp: '', expTxt: 'Month-to-month', expSub: '', filter: ['candid'] },
  { id: 'demo-ms', cls: 'candid-svc', logo: 'microsoft', logoTxt: 'MS', name: 'Microsoft 365 Business', vendor: 'Direct — 22 licenses (4 inactive)', status: 'active', statusTxt: 'Active', badge: 'candid', pending: false, amount: '$660', exp: '', expTxt: 'Expires Mar 2027', expSub: '', filter: ['candid'] },
];

type ContactInfo = {
  name: string;
  email: string;
  company: string;
  initials: string;
};

const DEMO_CONTACT: ContactInfo = {
  name: 'John Mitchell',
  email: 'john@acmecorp.com',
  company: 'Acme Corporation',
  initials: 'JM',
};

function titleCaseLocalPart(email: string) {
  const local = email.split('@')[0] ?? 'there';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveContact(sessionUser?: CandidSessionUser): ContactInfo {
  if (!sessionUser?.email) return DEMO_CONTACT;
  const email = sessionUser.email;
  const name =
    sessionUser.name?.trim() || titleCaseLocalPart(email);
  const parts = name.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase()
      : (parts[0]?.slice(0, 2).toUpperCase() ?? email.slice(0, 2).toUpperCase());
  return { name, email, company: DEMO_CONTACT.company, initials };
}

const ContactContext = createContext<ContactInfo>(DEMO_CONTACT);

function useContact() {
  return useContext(ContactContext);
}

// ── TYPES ─────────────────────────────────────────────────────
type Screen = 'login' | 'admin' | 'prospect' | 'member';
type Role = 'member' | 'prospect' | 'admin';
type AdminView = 'dashboard' | 'services' | 'serviceability' | 'reports' | 'chat' | 'roadmap' | 'alerts' | 'settings';
type MemberView = 'mdashboard' | 'mservices' | 'maddservice' | 'mreports' | 'mchat' | 'malerts' | 'msettings';
type AddServiceStage = 'upload' | 'processing' | 'result' | 'human-review' | 'confirm';
type ProspectStage = 'form' | 'processing' | 'confirm';

interface ChatMsg { type: 'user' | 'bot'; text: string; time: string; isTyping?: boolean; }
interface ConvMsg { role: string; content: string; }

// ── HELPERS ───────────────────────────────────────────────────
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ── LOGO COMPONENT ────────────────────────────────────────────
function LogoDots({ size = 'sb' }: { size?: 'login' | 'sb' | 'prospect' }) {
  const configs = {
    login: { cls: 'l-dots', dotCls: 'l-dot', divCls: 'l-divider', wordCls: 'l-wordmark', wordSize: '24px' },
    sb:    { cls: 'sb-dots', dotCls: 'sb-dot', divCls: 'sb-div', wordCls: 'sb-word', wordSize: '18px' },
    prospect: { cls: 'prospect-logo-dots', dotCls: 'prospect-logo-dot', divCls: 'prospect-logo-div', wordCls: 'prospect-logo-word', wordSize: '20px' },
  };
  const c = configs[size];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'login' ? 14 : 12 }}>
      <div className={c.cls}>
        {[...Array(8)].map((_, i) => <div key={i} className={c.dotCls} />)}
        <div className={`${c.dotCls} h`} />
      </div>
      <div className={c.divCls} />
      <div className={c.wordCls}>CANDID</div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function CandidApp({
  sessionUser,
  userId,
  appRole = 'user',
  signOutAction,
}: CandidAppProps = {}) {
  const contact = resolveContact(sessionUser);

  // Screen / nav state
  const [screen, setScreen] = useState<Screen>(() => {
    if (!sessionUser?.email) return 'login';
    return appRole === 'admin' ? 'admin' : 'member';
  });
  const [role, setRole] = useState<Role>(() => {
    if (!sessionUser?.email) return 'member';
    return appRole === 'admin' ? 'admin' : 'member';
  });
  const [adminView, setAdminView] = useState<AdminView>('dashboard');
  const [memberView, setMemberView] = useState<MemberView>('mdashboard');

  // Login form
  const [loginEmail, setLoginEmail] = useState(
    () => sessionUser?.email || 'john@acmecorp.com'
  );
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const router = useRouter();

  // Dropdowns
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [memberAvatarMenuOpen, setMemberAvatarMenuOpen] = useState(false);

  // Services filter
  const [serviceFilter, setServiceFilter] = useState('all');

  // Add Service Modal
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [addStage, setAddStage] = useState<AddServiceStage>('upload');
  const [processingLabel, setProcessingLabel] = useState(processingMessages[0]);
  const [addResult, setAddResult] = useState<typeof serviceProfiles['merchant'] | null>(null);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [addServiceProductName, setAddServiceProductName] = useState('');
  const [addServiceError, setAddServiceError] = useState('');
  const [userServices, setUserServices] = useState<ServiceCardModel[]>([]);

  // Quote Modal
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteStage, setQuoteStage] = useState<'form' | 'confirm'>('form');
  const [quoteName, setQuoteName] = useState('');
  const [quoteCompany, setQuoteCompany] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quotePhone, setQuotePhone] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const [quoteSelectedPills, setQuoteSelectedPills] = useState<string[]>([]);
  const [quoteConfirmText, setQuoteConfirmText] = useState('');

  // Admin chat (Hank)
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => {
    const c = resolveContact(sessionUser);
    const first = c.name.split(/\s+/)[0] ?? 'there';
    return [
      {
        type: 'bot',
        time: 'Just now',
        text: `Hi ${first} — I'm Hank, your personal Candid assistant. Think of me as your team member who never sleeps and always knows your account.<br><br>Your Square bill was <strong>$94 higher than expected</strong> this month — fax plan overage. I can explain exactly why and what to do about it.<br><br>Also, your <strong>RingCentral contract expires in 40 days</strong> and you're paying $500/mo above market. That's the most urgent item on your account. Want me to walk you through your options?`,
      },
    ];
  });
  const [chatConversation, setChatConversation] = useState<ConvMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // Member chat
  const [memberChatInput, setMemberChatInput] = useState('');
  const [memberChatMessages, setMemberChatMessages] = useState<ChatMsg[]>([
    {
      type: 'bot', time: 'Just now',
      text: "Hi! I'm Hank, your Candid assistant. I have full visibility into your account, contracts, and savings opportunities. What would you like to know?",
    },
  ]);
  const [memberChatConversation, setMemberChatConversation] = useState<ConvMsg[]>([]);
  const [memberChatLoading, setMemberChatLoading] = useState(false);
  const memberChatRef = useRef<HTMLDivElement>(null);

  // Prospect
  const [prospectFiles, setProspectFiles] = useState<File[]>([]);
  const [prospectStage, setProspectStage] = useState<ProspectStage>('form');
  const [pProcessingLabel, setPProcessingLabel] = useState('Sending your bills to the Candid team...');
  const [pName, setPName] = useState('');
  const [pCompany, setPCompany] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pTeamEmails, setPTeamEmails] = useState('');
  const [pError, setPError] = useState('');
  const [pConfirmText, setPConfirmText] = useState('');
  const [prospectDragOver, setProspectDragOver] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Serviceability
  const [saStreet, setSaStreet] = useState('');
  const [saCity, setSaCity] = useState('');
  const [saState, setSaState] = useState('');
  const [saResults, setSaResults] = useState<{ name: string; speed: string; price: string; tag: string }[] | null>(null);

  // Settings toggles
  const [settingToggles, setSettingToggles] = useState({ email: true, sms: false, slack: true, autoRenew: true });
  const [updateCardOpen, setUpdateCardOpen] = useState(false);

  useEffect(() => {
    setLoginError('');
  }, [role]);

  const refreshUserServices = useCallback(async () => {
    if (!userId) return;
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('account_services')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load services', error);
      return;
    }
    setUserServices((data as AccountServiceRow[]).map(accountServiceToCard));
  }, [userId]);

  useEffect(() => {
    void refreshUserServices();
  }, [refreshUserServices]);

  // Close avatar menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!t.closest('.avatar-wrap')) {
        setAvatarMenuOpen(false);
        setMemberAvatarMenuOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Auto-scroll chats
  useEffect(() => { chatMessagesRef.current?.scrollTo(0, chatMessagesRef.current.scrollHeight); }, [chatMessages]);
  useEffect(() => { memberChatRef.current?.scrollTo(0, memberChatRef.current.scrollHeight); }, [memberChatMessages]);

  // ── AUTH ────────────────────────────────────────────────────
  const doLogin = async (e?: FormEvent) => {
    e?.preventDefault();
    setLoginError('');

    if (role === 'prospect') {
      setScreen('prospect');
      return;
    }

    const email = loginEmail.trim();
    const password = loginPass;
    if (!email) {
      setLoginError('Please enter your email address.');
      return;
    }
    if (!password) {
      setLoginError('Please enter your password.');
      return;
    }

    setLoginLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoginLoading(false);

    if (error) {
      setLoginError(error.message);
      return;
    }

    router.push(role === 'admin' ? '/admin' : '/app');
    router.refresh();
  };
  const doLogout = async () => {
    setAvatarMenuOpen(false);
    setMemberAvatarMenuOpen(false);
    if (signOutAction) await signOutAction();
    else setScreen('login');
  };

  // ── ADD SERVICE ─────────────────────────────────────────────
  const openAddService = () => {
    setAddServiceOpen(true);
    setAddStage('upload');
    setAddServiceProductName('');
    setAddServiceError('');
  };
  const closeAddService = () => {
    setAddServiceOpen(false);
    setTimeout(() => {
      setAddStage('upload');
      setAddServiceProductName('');
      setAddServiceError('');
    }, 300);
  };

  const persistPendingService = useCallback(
    async (file: File, productName: string) => {
      if (!userId) return;
      const supabase = createSupabaseBrowserClient();
      const logoKey = logoKeyFromLabel(`${productName} ${file.name}`);

      const { data: row, error: insertError } = await supabase
        .from('account_services')
        .insert({
          user_id: userId,
          name: productName,
          vendor: 'Bill submitted — analysis in progress',
          status: 'pending_analysis',
          logo_key: logoKey,
        })
        .select('*')
        .single();

      if (insertError || !row) throw insertError ?? new Error('Insert failed');

      const storagePath = `${userId}/${row.id}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('service-bills')
        .upload(storagePath, file, { upsert: true });

      if (uploadError) {
        await supabase.from('account_services').delete().eq('id', row.id);
        throw uploadError;
      }

      const { error: updateError } = await supabase
        .from('account_services')
        .update({ bill_storage_path: storagePath })
        .eq('id', row.id);

      if (updateError) throw updateError;
    },
    [userId]
  );

  const simulateUpload = useCallback((filename: string) => {
    setAddStage('processing');
    setProcessingLabel(processingMessages[0]);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < processingMessages.length) setProcessingLabel(processingMessages[step]);
    }, 600);
    setTimeout(() => {
      clearInterval(interval);
      const type = detectServiceType(
        [addServiceProductName.trim(), filename].filter(Boolean).join(' ')
      );
      const profile = serviceProfiles[type] ?? serviceProfiles.default;
      if (type === 'default') { setAddStage('human-review'); return; }
      setAddResult(profile);
      setAddStage('result');
    }, 3200);
  }, [addServiceProductName]);

  const beginBillUpload = useCallback(
    async (file: File) => {
      const productName = addServiceProductName.trim();
      if (!productName) {
        setAddServiceError('Please enter a product / service name before uploading your bill.');
        return;
      }
      setAddServiceError('');

      if (userId) {
        try {
          await persistPendingService(file, productName);
          await refreshUserServices();
          setAddStage('confirm');
          return;
        } catch (err) {
          console.error('persistPendingService', err);
          setAddServiceError('Could not save your service. Please try again.');
          return;
        }
      }

      simulateUpload(file.name);
    },
    [addServiceProductName, userId, persistPendingService, refreshUserServices, simulateUpload]
  );

  const finishAddServiceAndViewServices = () => {
    closeAddService();
    if (screen === 'admin') setAdminView('services');
    else if (screen === 'member') setMemberView('mservices');
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void beginBillUpload(file);
    e.target.value = '';
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setUploadDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void beginBillUpload(file);
  };

  // ── CHAT ────────────────────────────────────────────────────
  const sendChat = async (text?: string) => {
    const msg = text ?? chatInput;
    if (!msg.trim() || chatLoading) return;
    setChatInput('');
    setChatLoading(true);
    setChatMessages(prev => [...prev, { type: 'user', text: msg, time: now() }]);
    const historyWithUser = [...chatConversation, { role: 'user', content: msg }];
    try {
      const reply = await callHankAPI(historyWithUser);
      const finalConv = [...historyWithUser, { role: 'assistant', content: reply }];
      setChatConversation(finalConv);
      setChatMessages(prev => [...prev, { type: 'bot', text: reply, time: now() }]);
    } catch (err) {
      console.error('sendChat', err);
      const errText =
        "Something went wrong and I couldn't finish that reply. Please try again.";
      setChatConversation([
        ...historyWithUser,
        { role: 'assistant', content: errText },
      ]);
      setChatMessages(prev => [...prev, { type: 'bot', text: errText, time: now() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const sendMemberChat = async (text?: string) => {
    const msg = text ?? memberChatInput;
    if (!msg.trim() || memberChatLoading) return;
    setMemberChatInput('');
    setMemberChatLoading(true);
    setMemberChatMessages(prev => [...prev, { type: 'user', text: msg, time: now() }]);
    const historyWithUser = [...memberChatConversation, { role: 'user', content: msg }];
    try {
      const reply = await callHankAPI(historyWithUser);
      const newConv = [...historyWithUser, { role: 'assistant', content: reply }];
      setMemberChatConversation(newConv);
      setMemberChatMessages(prev => [...prev, { type: 'bot', text: reply, time: now() }]);
    } catch (err) {
      console.error('sendMemberChat', err);
      const errText =
        "Something went wrong and I couldn't finish that reply. Please try again.";
      setMemberChatConversation([
        ...historyWithUser,
        { role: 'assistant', content: errText },
      ]);
      setMemberChatMessages(prev => [...prev, { type: 'bot', text: errText, time: now() }]);
    } finally {
      setMemberChatLoading(false);
    }
  };

  // ── QUOTE ───────────────────────────────────────────────────
  const submitQuote = () => {
    if (!quoteName.trim() || !quoteCompany.trim() || !quoteEmail.trim() || !quotePhone.trim()) {
      setQuoteError('Please fill in your name, company, email, and phone number.'); return;
    }
    setQuoteError('');
    const selected = quoteSelectedPills.join(', ');
    setQuoteConfirmText(`Thank you, <strong>${quoteName}</strong>. Your request has been sent to the Candid team. A specialist will reach out to <strong>${quoteEmail}</strong> within 1 business day with your custom quote${selected ? ' for: ' + selected : ''}.`);
    setQuoteStage('confirm');
  };

  // ── SERVICEABILITY ──────────────────────────────────────────
  const runServiceability = () => {
    setSaResults([
      { name: 'Comcast Business', speed: '500 Mbps / 1 Gbps', price: '$220/mo', tag: 'Best value' },
      { name: 'AT&T Fiber', speed: '1 Gbps symmetric', price: '$190/mo', tag: 'Fastest' },
      { name: 'Spectrum Business', speed: '400 Mbps', price: '$175/mo', tag: 'Available now' },
      { name: 'Lumen/CenturyLink', speed: '100–500 Mbps', price: '$140/mo', tag: 'Budget option' },
      { name: 'Verizon Business', speed: '1 Gbps', price: '$210/mo', tag: 'Enterprise grade' },
      { name: 'Cox Business', speed: '300 Mbps', price: '$160/mo', tag: 'Regional option' },
    ]);
  };

  // ── PROSPECT ────────────────────────────────────────────────
  const addProspectFiles = (files: File[]) => {
    setProspectFiles(prev => {
      const next = [...prev];
      files.forEach(f => { if (!next.find(e => e.name === f.name)) next.push(f); });
      return next;
    });
  };

  const submitProspectForm = () => {
    if (!pName.trim() || !pCompany.trim() || !pPhone.trim() || !pEmail.trim()) {
      setPError('Please fill in your name, company, phone number, and email address before submitting.'); return;
    }
    if (!pEmail.includes('@') || !pEmail.includes('.')) {
      setPError('Please enter a valid email address.'); return;
    }
    setPError('');
    setProspectStage('processing');
    const msgs = ['Sending your bills to the Candid team...', 'Logging your information securely...', 'Preparing your account...', 'Almost done...'];
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < msgs.length) setPProcessingLabel(msgs[step]);
    }, 700);
    setTimeout(() => {
      clearInterval(interval);
      const teamNote = pTeamEmails.trim() ? ` A copy will also be sent to: ${pTeamEmails}.` : '';
      setPConfirmText(`<strong>${pName}</strong>, your bills have been received by the Candid team. You'll receive your login credentials and savings summary at <strong>${pEmail}</strong> within 24 hours.${teamNote}`);
      setProspectStage('confirm');
    }, 3000);
  };

  const resetProspect = () => {
    setProspectFiles([]); setProspectStage('form');
    setPName(''); setPCompany(''); setPPhone(''); setPEmail(''); setPTeamEmails('');
    setCalendarOpen(false);
  };

  // ═══════════════════════════════════════════════════════════
  // ── RENDER ─────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════

  return (
    <ContactContext.Provider value={contact}>
    <>
      {/* ── LOGIN ─────────────────────────────────────────── */}
      {screen === 'login' && (
        <div className="login-screen">
          <div className="login-left">
            <div className="login-logo">
              <LogoDots size="login" />
            </div>
            <div className="login-tagline">
              Know what you're paying.<br />
              Know what you should be.<br />
              <span>Fix the difference.</span>
            </div>
            <p className="login-desc">
              Candid Intelligence Platform gives your business complete visibility into every technology cost — with AI-powered analysis, contract tracking, and real savings already negotiated on your behalf.
            </p>
            <div className="login-stats">
              <div><div className="ls-val">$8,240</div><div className="ls-label">LIFETIME SAVINGS</div></div>
              <div><div className="ls-val">5</div><div className="ls-label">SERVICES MANAGED</div></div>
              <div><div className="ls-val">2</div><div className="ls-label">EXPIRING SOON</div></div>
            </div>
          </div>

          <div className="login-right">
            <div className="login-card">
              <h2>Welcome back.</h2>
              <p>Sign in to your Candid Intelligence account</p>

              {/* Role selector */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 24 }}>
                {(['member', 'prospect', 'admin'] as Role[]).map(r => (
                  <div
                    key={r}
                    className={`role-pill${role === r ? ' active' : ''}`}
                    onClick={() => setRole(r)}
                  >
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{r === 'member' ? '🏢' : r === 'prospect' ? '✨' : '⚙️'}</div>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{r === 'member' ? 'Member' : r === 'prospect' ? 'New Here?' : 'Admin'}</div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>{r === 'member' ? 'Client portal' : r === 'prospect' ? 'Get a free analysis' : 'Candid team'}</div>
                  </div>
                ))}
              </div>

              <form onSubmit={doLogin} noValidate>
              <div className="form-group">
                <label htmlFor="login-email">Email Address</label>
                <input id="login-email" type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
              </div>

              {role !== 'prospect' && (
                <div className="form-group">
                  <label htmlFor="login-pass">Password</label>
                  <input id="login-pass" type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                </div>
              )}

              {role === 'prospect' && (
                <div style={{ background: 'rgba(200,40,30,0.06)', border: '1px solid rgba(200,40,30,0.15)', borderRadius: 7, padding: '12px 14px', fontSize: 12, color: 'var(--gray-mid)', lineHeight: 1.6, marginBottom: 16 }}>
                  ✦ <strong style={{ color: 'var(--gray-dark)' }}>No account needed.</strong> Just enter your email and drop in a bill. Our team will review it and reach out within 24 hours with your savings analysis.
                </div>
              )}

              {loginError && role !== 'prospect' ? (
                <div
                  style={{
                    border: '1px solid rgba(200,40,30,0.35)',
                    background: 'rgba(200,40,30,0.1)',
                    color: '#FCA5A5',
                    padding: '10px 12px',
                    borderRadius: 6,
                    marginBottom: 16,
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  {loginError}
                </div>
              ) : null}

              <button type="submit" className="login-btn" disabled={loginLoading}>
                {loginLoading
                  ? 'Signing in…'
                  : role === 'prospect'
                    ? 'Submit My Bill for Analysis →'
                    : role === 'admin'
                      ? 'Sign In — Admin →'
                      : 'Sign In to My Account →'}
              </button>
              </form>

              <div className="login-footer-note">
                {role === 'prospect'
                  ? <span>Already a member? <span style={{ color: 'var(--red-light)', cursor: 'pointer' }} onClick={() => setRole('member')}>Sign in here →</span></span>
                  : <span>Forgot your password? <a href="#">Reset it here</a><br />Not a client yet? Click "New Here?" above</span>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADMIN SHELL ───────────────────────────────────── */}
      {screen === 'admin' && (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          {/* Sidebar */}
          <div className="sidebar">
            <div className="sb-logo">
              <LogoDots size="sb" />
            </div>
            <div className="sb-user">
              <div className="sb-user-name">{contact.name}</div>
              <div className="sb-user-co">{contact.company}</div>
              <div className="sb-user-badge">Fees Waived</div>
            </div>
            <nav className="sb-nav">
              <div className="sb-section-label">Overview</div>
              {([
                { id: 'dashboard', icon: '⊞', label: 'Dashboard' },
                { id: 'services', icon: '◈', label: 'My Services', badge: '5' },
                { id: 'serviceability', icon: '+', label: 'Add a Service', badgeCls: 'green', badge: 'New' },
              ] as const).map(item => (
                <div
                  key={item.id}
                  className={`sb-item${adminView === item.id ? ' active' : ''}`}
                  onClick={() => setAdminView(item.id as AdminView)}
                >
                  <span className="sb-icon">{item.icon}</span>
                  {item.label}
                  {'badge' in item && item.badge && (
                    <span className={`sb-badge${(item as any).badgeCls ? ` ${(item as any).badgeCls}` : ''}`}>{item.badge}</span>
                  )}
                </div>
              ))}
              <div className="sb-section-label">Intelligence</div>
              {([
                { id: 'reports', icon: '📋', label: 'Reports' },
                { id: 'chat', icon: '✦', label: 'Ask Hank (AI)' },
                { id: 'roadmap', icon: '🗺', label: 'Platform Roadmap' },
              ] as const).map(item => (
                <div
                  key={item.id}
                  className={`sb-item${adminView === item.id ? ' active' : ''}`}
                  onClick={() => setAdminView(item.id as AdminView)}
                >
                  <span className="sb-icon">{item.icon}</span>
                  {item.label}
                </div>
              ))}
              <div className="sb-section-label">Account</div>
              <div
                className={`sb-item${adminView === 'alerts' ? ' active' : ''}`}
                onClick={() => setAdminView('alerts')}
              >
                <span className="sb-icon">🔔</span>
                Alerts &amp; Actions
                <span className="sb-badge">4</span>
              </div>
              <div
                className={`sb-item${adminView === 'settings' ? ' active' : ''}`}
                onClick={() => setAdminView('settings')}
              >
                <span className="sb-icon">⚙️</span>
                Settings
              </div>
            </nav>
            <div className="sb-bottom">
              <div className="sb-logout" onClick={doLogout}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Sign Out
              </div>
            </div>
          </div>

          {/* Main */}
          <div className="main">
            {/* Topbar */}
            <div className="topbar">
              <div className="topbar-title">{ADMIN_VIEW_TITLES[adminView]}</div>
              <div className="topbar-right">
                <div className="topbar-notif" onClick={() => setAdminView('alerts')}>
                  🔔<div className="notif-dot" />
                </div>
                <div className="avatar-wrap" style={{ position: 'relative' }}>
                  <div className="topbar-avatar" onClick={e => { e.stopPropagation(); setAvatarMenuOpen(o => !o); }}>{contact.initials}</div>
                  {avatarMenuOpen && (
                    <div className="avatar-menu open" onClick={e => e.stopPropagation()}>
                      <div style={{ padding: '16px', borderBottom: '1px solid var(--gray-border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)' }}>{contact.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray)' }}>{contact.email}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Admin</div>
                      </div>
                      {[
                        { label: 'Account Settings', view: 'settings' as AdminView },
                        { label: 'Alerts & Actions', view: 'alerts' as AdminView },
                      ].map(item => (
                        <div
                          key={item.label}
                          onClick={() => { setAdminView(item.view); setAvatarMenuOpen(false); }}
                          style={{ padding: '11px 16px', fontSize: 13, color: 'var(--gray-dark)', cursor: 'pointer' }}
                          onMouseOver={e => (e.currentTarget.style.background = 'var(--gray-light)')}
                          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >{item.label}</div>
                      ))}
                      <div style={{ borderTop: '1px solid var(--gray-border)' }}>
                        <div onClick={doLogout} style={{ padding: '11px 16px', fontSize: 13, color: 'var(--red)', cursor: 'pointer' }}>Sign Out</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content / Views */}
            <div className="content">
              {adminView === 'dashboard' && <DashboardView onViewChange={setAdminView} />}
              {adminView === 'services' && (
                <ServicesView
                  filter={serviceFilter}
                  onFilterChange={setServiceFilter}
                  onOpenAddService={openAddService}
                  services={userId ? userServices : DEMO_SERVICES}
                  showDemoExternal={!userId}
                />
              )}
              {adminView === 'serviceability' && <ServiceabilityView saStreet={saStreet} setSaStreet={setSaStreet} saCity={saCity} setSaCity={setSaCity} saState={saState} setSaState={setSaState} saResults={saResults} onRun={runServiceability} onOpenAddService={openAddService} onOpenQuote={() => setQuoteOpen(true)} onViewChange={setAdminView} />}
              {adminView === 'reports' && <ReportsView />}
              {adminView === 'chat' && (
                <ChatView
                  messages={chatMessages}
                  loading={chatLoading}
                  input={chatInput}
                  onInputChange={setChatInput}
                  onSend={() => sendChat()}
                  onSuggestion={sendChat}
                  messagesRef={chatMessagesRef}
                  userInitials={contact.initials}
                />
              )}
              {adminView === 'roadmap' && <RoadmapView />}
              {adminView === 'alerts' && <AlertsView onViewChange={setAdminView} />}
              {adminView === 'settings' && <SettingsView />}
            </div>
          </div>
        </div>
      )}

      {/* ── PROSPECT SHELL ────────────────────────────────── */}
      {screen === 'prospect' && (
        <div className="prospect-shell">
          <div className="prospect-wrap">
            <div className="prospect-header">
              <LogoDots size="prospect" />
            </div>
            <div className="prospect-card">
              <div className="prospect-card-header">
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 600, color: 'var(--white)', marginBottom: 8 }}>
                  Get your free savings analysis.
                </div>
                <div style={{ fontSize: 13, color: '#777', lineHeight: 1.6 }}>
                  Drop in a bill. We'll tell you exactly what you're overpaying and what you should be paying instead — usually within a few hours.
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                  {[{ icon: '🔒', text: 'Completely confidential' }, { icon: '⚡', text: 'No obligation' }, { icon: '✦', text: 'AI-powered analysis' }].map(b => (
                    <div key={b.text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#777' }}>
                      <span>{b.icon}</span>{b.text}
                    </div>
                  ))}
                </div>
              </div>
              <div className="prospect-card-body">
                {prospectStage === 'form' && (
                  <>
                    {/* Upload zone */}
                    <div
                      style={{ border: `2px dashed ${prospectDragOver ? 'var(--red)' : 'var(--gray-border)'}`, borderRadius: 10, padding: '28px 24px', textAlign: 'center', cursor: 'pointer', background: prospectDragOver ? 'rgba(200,40,30,0.04)' : 'var(--gray-light)', marginBottom: 20, position: 'relative', transition: 'all 0.2s' }}
                      onDragOver={e => { e.preventDefault(); setProspectDragOver(true); }}
                      onDragLeave={() => setProspectDragOver(false)}
                      onDrop={e => { e.preventDefault(); setProspectDragOver(false); addProspectFiles(Array.from(e.dataTransfer.files)); }}
                    >
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv" multiple style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} onChange={e => e.target.files && addProspectFiles(Array.from(e.target.files))} />
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 6 }}>Drop your bill here, or click to browse</div>
                      <div style={{ fontSize: 12, color: 'var(--gray)' }}>PDF, image, Excel, or CSV. Any format works — Hank handles the parsing.</div>
                    </div>

                    {/* File list */}
                    {prospectFiles.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)', letterSpacing: '0.06em', marginBottom: 8 }}>
                          {prospectFiles.length} file{prospectFiles.length > 1 ? 's' : ''} ready to submit
                        </div>
                        {prospectFiles.map((f, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--white)', border: '1px solid var(--gray-border)', borderRadius: 7, padding: '9px 12px', marginBottom: 6 }}>
                            <span>{f.name.endsWith('.pdf') ? '📄' : /\.(png|jpg|jpeg)$/i.test(f.name) ? '🖼' : '📊'}</span>
                            <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--gray)' }}>{(f.size / 1024).toFixed(0)} KB</span>
                            <span onClick={() => setProspectFiles(prev => prev.filter((_, j) => j !== i))} style={{ fontSize: 14, color: 'var(--gray)', cursor: 'pointer' }}>✕</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Info fields */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                      {[
                        { label: 'Your Name', val: pName, set: setPName, placeholder: 'Jane Smith' },
                        { label: 'Company Name', val: pCompany, set: setPCompany, placeholder: 'Acme Corporation' },
                        { label: 'Phone Number', val: pPhone, set: setPPhone, placeholder: '(555) 555-5555' },
                        { label: 'Email Address', val: pEmail, set: setPEmail, placeholder: 'jane@acmecorp.com' },
                      ].map(f => (
                        <div key={f.label}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 7 }}>{f.label}</label>
                          <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={{ width: '100%', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '11px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--gray-dark)', outline: 'none' }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 7 }}>CC Team Members <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                      <input value={pTeamEmails} onChange={e => setPTeamEmails(e.target.value)} placeholder="colleague@company.com, another@company.com" style={{ width: '100%', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '11px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--gray-dark)', outline: 'none' }} />
                    </div>
                    {pError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{pError}</div>}
                    <button onClick={submitProspectForm} style={{ width: '100%', background: 'linear-gradient(135deg,var(--red-dark),var(--red-light))', color: 'white', border: 'none', borderRadius: 8, padding: 15, fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
                      Submit for Free Analysis →
                    </button>
                    <div style={{ marginTop: 16, fontSize: 12, color: 'var(--gray)', textAlign: 'center' }}>
                      Already a member? <span style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => { setRole('member'); setScreen('login'); }}>Sign in →</span>
                    </div>
                  </>
                )}

                {prospectStage === 'processing' && (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i === 1 ? 'var(--gray)' : 'var(--red)', animation: 'pulse-dot 1.4s infinite', animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 8 }}>{pProcessingLabel}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray)' }}>This usually takes less than a minute</div>
                  </div>
                )}

                {prospectStage === 'confirm' && (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 12 }}>You're in the queue.</div>
                    <div style={{ fontSize: 14, color: 'var(--gray-mid)', lineHeight: 1.7, marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: pConfirmText }} />
                    <button onClick={() => setCalendarOpen(o => !o)} style={{ background: 'linear-gradient(135deg,var(--red-dark),var(--red-light))', color: 'white', border: 'none', borderRadius: 7, padding: '12px 28px', fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
                      Schedule a Discovery Call
                    </button>
                    {calendarOpen && (
                      <div style={{ marginTop: 16, background: 'var(--gray-light)', border: '1px solid var(--gray-border)', borderRadius: 8, padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--gray)' }}>
                        📅 Calendly embed would go here — link to candidsolutions.com/schedule
                      </div>
                    )}
                    <div style={{ marginTop: 16 }}>
                      <span onClick={resetProspect} style={{ fontSize: 12, color: 'var(--gray)', cursor: 'pointer' }}>Submit another bill →</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MEMBER SHELL ──────────────────────────────────── */}
      {screen === 'member' && (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <div className="member-sidebar">
            <div className="sb-logo">
              <LogoDots size="sb" />
            </div>
            <div className="sb-user">
              <div className="sb-user-name">{contact.name}</div>
              <div className="sb-user-co">{contact.company}</div>
              <div className="sb-user-badge">Member</div>
            </div>
            <nav className="sb-nav">
              {([
                { id: 'mdashboard', icon: '⊞', label: 'Dashboard' },
                { id: 'mservices', icon: '◈', label: 'My Services', badge: '3' },
                { id: 'maddservice', icon: '+', label: 'Add a Service' },
                { id: 'mreports', icon: '📋', label: 'Reports' },
                { id: 'mchat', icon: '✦', label: 'Ask Hank (AI)' },
                { id: 'malerts', icon: '🔔', label: 'Alerts', badge: '3' },
                { id: 'msettings', icon: '⚙️', label: 'Settings' },
              ] as const).map(item => (
                <div
                  key={item.id}
                  className={`sb-item${memberView === item.id ? ' active' : ''}`}
                  onClick={() => setMemberView(item.id as MemberView)}
                >
                  <span className="sb-icon">{item.icon}</span>
                  {item.label}
                  {'badge' in item && item.badge && <span className="sb-badge">{item.badge}</span>}
                </div>
              ))}
            </nav>
            <div className="sb-bottom">
              <div className="sb-logout" onClick={doLogout}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Sign Out
              </div>
            </div>
          </div>

          <div className="member-main">
            <div className="topbar">
              <div className="topbar-title">{MEMBER_VIEW_TITLES[memberView]}</div>
              <div className="topbar-right">
                <div className="topbar-notif" onClick={() => setMemberView('malerts')}>🔔<div className="notif-dot" /></div>
                <div className="avatar-wrap" style={{ position: 'relative' }}>
                  <div className="topbar-avatar" onClick={e => { e.stopPropagation(); setMemberAvatarMenuOpen(o => !o); }}>{contact.initials}</div>
                  {memberAvatarMenuOpen && (
                    <div className="avatar-menu open" onClick={e => e.stopPropagation()}>
                      <div style={{ padding: 16, borderBottom: '1px solid var(--gray-border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)' }}>{contact.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray)' }}>{contact.email}</div>
                      </div>
                      <div onClick={() => { setMemberView('msettings'); setMemberAvatarMenuOpen(false); }} style={{ padding: '11px 16px', fontSize: 13, color: 'var(--gray-dark)', cursor: 'pointer' }}>Account Settings</div>
                      <div style={{ borderTop: '1px solid var(--gray-border)' }}>
                        <div onClick={doLogout} style={{ padding: '11px 16px', fontSize: 13, color: 'var(--red)', cursor: 'pointer' }}>Sign Out</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="content">
              {memberView === 'mdashboard' && <MemberDashboardView onViewChange={setMemberView} />}
              {memberView === 'mservices' && (
                <MemberServicesView
                  onOpenAddService={openAddService}
                  services={userId ? userServices : DEMO_SERVICES.slice(0, 3)}
                />
              )}
              {memberView === 'maddservice' && <MemberAddServiceView onOpenAddService={openAddService} onOpenQuote={() => setQuoteOpen(true)} onViewChange={setMemberView} />}
              {memberView === 'mreports' && <ReportsView />}
              {memberView === 'mchat' && (
                <ChatView
                  messages={memberChatMessages}
                  loading={memberChatLoading}
                  input={memberChatInput}
                  onInputChange={setMemberChatInput}
                  onSend={() => sendMemberChat()}
                  onSuggestion={sendMemberChat}
                  messagesRef={memberChatRef}
                  userInitials={contact.initials}
                />
              )}
              {memberView === 'malerts' && <AlertsView onViewChange={(v) => setMemberView('mchat')} />}
              {memberView === 'msettings' && <SettingsView />}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD SERVICE MODAL ─────────────────────────────── */}
      {addServiceOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) closeAddService(); }}>
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="modal-hank-avatar">✦</div>
                <div>
                  <div className="modal-title">Add a Service</div>
                  <div className="modal-subtitle">Upload your bill — Hank analyzes it in seconds</div>
                </div>
              </div>
              <button className="modal-close" onClick={closeAddService}>✕</button>
            </div>
            <div className="modal-body">
              {addStage === 'upload' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label
                      htmlFor="add-service-product-name"
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--gray)',
                        marginBottom: 7,
                      }}
                    >
                      Product / service name
                    </label>
                    <input
                      id="add-service-product-name"
                      type="text"
                      value={addServiceProductName}
                      onChange={e => setAddServiceProductName(e.target.value)}
                      placeholder="e.g. RingCentral, Comcast Business, Square"
                      style={{
                        width: '100%',
                        border: '1px solid var(--gray-border)',
                        borderRadius: 6,
                        padding: '11px 14px',
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 14,
                        color: 'var(--gray-dark)',
                        outline: 'none',
                        background: 'var(--white)',
                      }}
                    />
                  </div>
                  {addServiceError ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--red)',
                        marginBottom: 12,
                        lineHeight: 1.45,
                      }}
                    >
                      {addServiceError}
                    </div>
                  ) : null}
                  <div
                    className={`upload-zone${uploadDragOver ? ' drag-over' : ''}`}
                    onDragOver={e => { e.preventDefault(); setUploadDragOver(true); }}
                    onDragLeave={() => setUploadDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv" onChange={handleFileSelect} />
                    <div className="upload-icon">📄</div>
                    <div className="upload-title">Drop your invoice here</div>
                    <div className="upload-sub">Any bill, statement, or invoice — PDF, image, or spreadsheet<br />Hank will identify the service type and analyze your spend automatically</div>
                    <div className="upload-types">
                      {['PDF', 'JPG / PNG', 'XLSX', 'CSV'].map(t => <span key={t} className="upload-type-pill">{t}</span>)}
                    </div>
                  </div>
                  <div className="hank-quip">
                    <span className="hank-quip-icon">✦</span>
                    <span>Most invoices I've seen could buy a small car's worth of savings annually. Let's see what's hiding in yours.</span>
                  </div>
                </>
              )}

              {addStage === 'processing' && (
                <div className="processing-wrap">
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 4 }}>Hank is reading your bill...</div>
                  <div className="processing-dots"><span /><span /><span /></div>
                  <div className="processing-label">{processingLabel}</div>
                </div>
              )}

              {addStage === 'result' && addResult && (
                <>
                  <div className="result-service-banner">
                    <div className="result-eyebrow">✦ Hank's Analysis Complete</div>
                    <div className="result-service-name">{addResult.name}</div>
                    <div className="result-vendor">{addResult.vendor}</div>
                  </div>
                  <div className="result-stats">
                    <div className="result-stat">
                      <div className="result-stat-label">Your Current Rate</div>
                      <div className="result-stat-val red">{addResult.current}</div>
                    </div>
                    <div className="result-stat">
                      <div className="result-stat-label">Market Rate</div>
                      <div className="result-stat-val">{addResult.market}</div>
                    </div>
                    <div className="result-stat">
                      <div className="result-stat-label">Savings Identified</div>
                      <div className="result-stat-val green">{addResult.savings}</div>
                    </div>
                  </div>
                  <div className="result-hank-note">✦ <strong>Hank's take:</strong> {addResult.note}</div>
                  <div className="result-actions">
                    <button className="btn-primary" onClick={closeAddService}>Schedule a Review Call →</button>
                    <button className="btn-secondary" onClick={closeAddService}>Close</button>
                  </div>
                </>
              )}

              {addStage === 'human-review' && (
                <div className="human-review-wrap">
                  <div className="human-review-icon">👨‍💼</div>
                  <div className="human-review-title">Sending to your Candid specialist</div>
                  <div className="human-review-sub">This one's going to a real human. We'll have a full savings analysis back to you within 24 hours — often much sooner.</div>
                  <button className="btn-primary" style={{ width: '100%', marginBottom: 10 }} onClick={() => setAddStage('confirm')}>Confirm Submission →</button>
                  <button className="btn-secondary" style={{ width: '100%' }} onClick={closeAddService}>Cancel</button>
                </div>
              )}

              {addStage === 'confirm' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 8 }}>
                    {userId ? 'Bill submitted for analysis' : 'Bill received.'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.65, marginBottom: 20 }}>
                    {userId
                      ? 'Your service is on My Services with status Pending Analysis. We will notify you when Hank finishes the review.'
                      : 'Your Candid specialist will have a savings analysis back to you within 24 hours.'}
                  </div>
                  <button
                    className="btn-primary"
                    style={{ width: '100%' }}
                    onClick={userId ? finishAddServiceAndViewServices : closeAddService}
                  >
                    {userId ? 'View My Services' : 'Done'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── QUOTE MODAL ───────────────────────────────────── */}
      {quoteOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) { setQuoteOpen(false); setQuoteStage('form'); } }}>
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="modal-hank-avatar">📋</div>
                <div>
                  <div className="modal-title">Request a Quote</div>
                  <div className="modal-subtitle">Tell us what you need — we'll handle the rest</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => { setQuoteOpen(false); setQuoteStage('form'); }}>✕</button>
            </div>
            <div className="modal-body">
              {quoteStage === 'form' && (
                <>
                  <div style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 16, lineHeight: 1.6 }}>What services are you looking to add or replace?</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                    {['Internet / Broadband', 'UCaaS / Phone System', 'Merchant Processing', 'Microsoft 365', 'Google Workspace', 'Cybersecurity', 'Cloud / Backup', 'IT Managed Services', 'CCaaS / Contact Center', 'IoT / Smart Office'].map(p => (
                      <button key={p} className={`q-pill${quoteSelectedPills.includes(p) ? ' selected' : ''}`} onClick={() => setQuoteSelectedPills(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}>{p}</button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    {[
                      { label: 'Your Name', val: quoteName, set: setQuoteName, placeholder: 'Jane Smith' },
                      { label: 'Company', val: quoteCompany, set: setQuoteCompany, placeholder: 'Acme Corp' },
                      { label: 'Email', val: quoteEmail, set: setQuoteEmail, placeholder: 'jane@acmecorp.com' },
                      { label: 'Phone', val: quotePhone, set: setQuotePhone, placeholder: '(555) 555-5555' },
                    ].map(f => (
                      <div key={f.label}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 7 }}>{f.label}</label>
                        <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={{ width: '100%', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '11px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--gray-dark)', outline: 'none' }} />
                      </div>
                    ))}
                  </div>
                  {quoteError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{quoteError}</div>}
                  <button className="btn-primary" style={{ width: '100%' }} onClick={submitQuote}>Request Custom Quote →</button>
                </>
              )}
              {quoteStage === 'confirm' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 12 }}>Request sent.</div>
                  <div style={{ fontSize: 13, color: 'var(--gray-mid)', lineHeight: 1.7, marginBottom: 20 }} dangerouslySetInnerHTML={{ __html: quoteConfirmText }} />
                  <button className="btn-primary" style={{ width: '100%' }} onClick={() => { setQuoteOpen(false); setQuoteStage('form'); }}>Done</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
    </ContactContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════
// ── VIEW COMPONENTS ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

function DashboardView({ onViewChange }: { onViewChange: (v: any) => void }) {
  const { name, company } = useContact();
  const first = name.split(/\s+/)[0] ?? 'there';
  return (
    <>
      <div className="greeting">
        <h2>Good morning, {first}.</h2>
        <p>Here's your technology cost snapshot for {company} — April 2026.</p>
      </div>

      <div className="savings-report-card">
        <div className="src-eyebrow">📊 April 2026 Monthly Savings Report</div>
        <div className="src-headline">Your portfolio is performing. Here's where you stand.</div>
        <div className="src-stats">
          <div className="src-stat">
            <div className="src-stat-label">This Month's Savings</div>
            <div className="src-stat-val green">$1,715</div>
            <div className="src-sub">vs. pre-Candid baseline</div>
          </div>
          <div className="src-stat">
            <div className="src-stat-label">Lifetime Savings</div>
            <div className="src-stat-val green">$8,240</div>
            <div className="src-sub">since joining Candid</div>
          </div>
          <div className="src-stat">
            <div className="src-stat-label">Remaining Opportunity</div>
            <div className="src-stat-val">$1,715</div>
            <div className="src-sub">additional savings available</div>
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi red"><div className="kpi-label">Monthly Spend</div><div className="kpi-value">$4,820</div><div className="kpi-sub">across 5 services</div></div>
        <div className="kpi green"><div className="kpi-label">Savings Identified</div><div className="kpi-value">$1,715</div><div className="kpi-sub">$20,580 annually</div></div>
        <div className="kpi amber"><div className="kpi-label">Expiring Soon</div><div className="kpi-value">2</div><div className="kpi-sub">within 60 days</div></div>
        <div className="kpi blue"><div className="kpi-label">Account Status</div><div className="kpi-value" style={{ fontSize: 18, marginTop: 4 }}>Fees Waived</div><div className="kpi-sub">Active Candid client</div></div>
      </div>

      <div className="dash-grid wide">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Active Services</div>
            <div className="card-action" onClick={() => onViewChange('services')}>View all →</div>
          </div>
          <div className="card-body">
            <div className="svc-row">
              <div className="svc-left"><div className="vendor-logo ringcentral">RC</div><div><div className="svc-name">UCaaS / Phone System</div><div className="svc-vendor">RingCentral — 25 seats</div></div></div>
              <div className="svc-right"><div className="svc-amount">$1,250/mo</div><div className="svc-exp urgent">Expires Jun 1, 2026</div></div>
            </div>
            <div className="svc-row">
              <div className="svc-left"><div className="vendor-logo comcast">CB</div><div><div className="svc-name">Internet Service</div><div className="svc-vendor">Comcast Business — 500 Mbps</div></div></div>
              <div className="svc-right"><div className="svc-amount">$420/mo</div><div className="svc-exp warn">Expires Jul 15, 2026</div></div>
            </div>
            <div className="svc-row">
              <div className="svc-left"><div className="vendor-logo square">SQ</div><div><div className="svc-name">Merchant Processing</div><div className="svc-vendor">Square — 3.1% effective</div><div className="bill-flag">Bill up $94 this month</div></div></div>
              <div className="svc-right"><div className="svc-amount">$1,954/mo</div><div className="svc-exp ok">Month-to-month</div></div>
            </div>
            <div className="svc-row">
              <div className="svc-left"><div className="vendor-logo microsoft">MS</div><div><div className="svc-name">Microsoft 365</div><div className="svc-vendor">Direct — 22 licenses (4 inactive)</div></div></div>
              <div className="svc-right"><div className="svc-amount">$660/mo</div><div className="svc-exp ok">Expires Mar 2027</div></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Alerts &amp; Actions</div>
            <div className="card-action" onClick={() => onViewChange('alerts')}>View all →</div>
          </div>
          <div className="card-body">
            {[
              { cls: 'red', title: 'Bill increase detected on Square.', body: '$94 above expected — fax plan overage.', time: 'Ask your AI assistant for details' },
              { cls: 'red', title: 'RingCentral expiring in 40 days.', body: '40% above market rate. Ideal window to renegotiate.', time: 'Action recommended now' },
              { cls: 'amber', title: 'Comcast renewal window opens in 55 days.', body: '$280/mo available — $140 savings.', time: 'Review in 2 weeks' },
              { cls: 'blue', title: '4 inactive Microsoft 365 licenses.', body: 'Rightsizing saves $80/mo with no contract change.', time: 'Quick win available now' },
            ].map((a, i) => (
              <div key={i} className="alert-item">
                <div className={`alert-dot ${a.cls}`} />
                <div><div className="alert-text"><strong>{a.title}</strong> {a.body}</div><div className="alert-time">{a.time}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">Savings Opportunity by Category</div>
          <div className="card-action" onClick={() => onViewChange('reports')}>Full report →</div>
        </div>
        <div className="card-body">
          <div className="savings-bars">
            {[
              { label: 'Merchant', pct: 76, val: '$650/mo' },
              { label: 'UCaaS', pct: 58, val: '$500/mo' },
              { label: 'Internet', pct: 33, val: '$140/mo' },
              { label: 'Microsoft 365', pct: 26, val: '$220/mo' },
              { label: 'IT Services', pct: 24, val: '$205/mo' },
            ].map(b => (
              <div key={b.label} className="sbar-row">
                <div className="sbar-label">{b.label}</div>
                <div className="sbar-track"><div className="sbar-fill" style={{ width: `${b.pct}%` }} /></div>
                <div className="sbar-val">{b.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function serviceMatchesFilter(svc: ServiceCardModel, filter: string) {
  if (filter === 'all') return true;
  if (filter === 'candid') return svc.filter.includes('candid');
  if (filter === 'external') return svc.cls === 'external-svc';
  if (filter === 'expiring') return svc.filter.includes('expiring');
  return true;
}

function ServiceCard({ svc }: { svc: ServiceCardModel }) {
  return (
    <div className={`service-card ${svc.cls}`}>
      <div className="sc-top">
        <div className={`sc-logo ${svc.logo}`}>{svc.logoTxt}</div>
        <div className="sc-badges">
          <div className={`sc-status ${svc.status}`}>{svc.statusTxt}</div>
          {svc.badge === 'candid' && <div className="candid-badge">✓ With Candid</div>}
          {svc.badge === 'external' && <div className="external-badge">Not with Candid</div>}
        </div>
      </div>
      <div className="sc-name">{svc.name}</div>
      <div className="sc-vendor">{svc.vendor}</div>
      <hr className="sc-divider" />
      <div className="sc-footer">
        {svc.pending ? (
          <div className="sc-pending-label sc-pending-footer">PENDING ANALYSIS</div>
        ) : (
          <>
            <div className="sc-amount">
              {svc.amount} <span>/mo</span>
            </div>
            <div className="sc-exp-wrap">
              <div className={`sc-exp-date${svc.exp ? ` ${svc.exp}` : ''}`}>{svc.expTxt}</div>
              {svc.expSub ? (
                <div className={`sc-exp-date${svc.exp ? ` ${svc.exp}` : ''}`}>{svc.expSub}</div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ServicesGrid({
  services,
  filter,
  onOpenAddService,
  showDemoExternal,
}: {
  services: ServiceCardModel[];
  filter?: string;
  onOpenAddService: () => void;
  showDemoExternal?: boolean;
}) {
  const visible = filter
    ? services.filter(svc => serviceMatchesFilter(svc, filter))
    : services;

  return (
    <div className="services-grid">
      {visible.map(svc => (
        <ServiceCard key={svc.id} svc={svc} />
      ))}

      {showDemoExternal && (!filter || filter === 'all' || filter === 'external') && (
        <div className="service-card external-svc">
          <div className="sc-top">
            <div className="sc-logo external">🔗</div>
            <div className="sc-badges">
              <div className="sc-status external">External</div>
              <div className="external-badge">Not with Candid</div>
            </div>
          </div>
          <div className="sc-name">Google Workspace</div>
          <div className="sc-vendor">Direct — 15 licenses</div>
          <hr className="sc-divider" />
          <div className="candid-compare">
            <div className="compare-box without">
              <div className="compare-label">Without Candid</div>
              <div className="compare-amount">$210</div>
              <div className="compare-sub">/mo currently</div>
            </div>
            <div className="compare-box with">
              <div className="compare-label">With Candid</div>
              <div className="compare-amount">$150</div>
              <div className="compare-sub">/mo estimated</div>
            </div>
          </div>
          <div className="sc-footer">
            <div className="sc-exp-wrap">
              <div className="sc-exp-date warn">Contract expires Aug 2026</div>
              <div className="switch-now">Switch now: save $60/mo</div>
            </div>
          </div>
        </div>
      )}

      <div className="add-service-card" onClick={onOpenAddService}>
        <div className="plus">＋</div>
        <div className="label">Add a Service</div>
        <div style={{ fontSize: 11, color: 'var(--gray)', textAlign: 'center', marginTop: 4 }}>
          Upload an invoice or bill
          <br />
          Hank will take it from there
        </div>
      </div>
    </div>
  );
}

function ServicesView({
  filter,
  onFilterChange,
  onOpenAddService,
  services,
  showDemoExternal,
}: {
  filter: string;
  onFilterChange: (f: string) => void;
  onOpenAddService: () => void;
  services: ServiceCardModel[];
  showDemoExternal?: boolean;
}) {
  const filters = ['all', 'candid', 'external', 'expiring'];

  return (
    <>
      <div className="greeting">
        <h2>
          My <span style={{ color: 'var(--red)' }}>Services</span>
        </h2>
        <p>
          All services under management. Candid services show verified savings. External
          services show what you&apos;d save by switching.
        </p>
      </div>
      <div className="services-toolbar">
        {filters.map(f => (
          <button
            key={f}
            className={`filter-btn${filter === f ? ' active' : ''}`}
            onClick={() => onFilterChange(f)}
          >
            {f === 'all'
              ? 'All Services'
              : f === 'candid'
                ? 'With Candid'
                : f === 'external'
                  ? 'External'
                  : 'Expiring Soon'}
          </button>
        ))}
      </div>
      <ServicesGrid
        services={services}
        filter={filter}
        onOpenAddService={onOpenAddService}
        showDemoExternal={showDemoExternal}
      />
    </>
  );
}

function ServiceabilityView({ saStreet, setSaStreet, saCity, setSaCity, saState, setSaState, saResults, onRun, onOpenAddService, onOpenQuote, onViewChange }: any) {
  return (
    <>
      <div className="greeting">
        <h2>Add a <span style={{ color: 'var(--red)' }}>New Service</span></h2>
        <p>Upload a bill, search for a service, or tell Hank what you need. We'll handle the rest.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { icon: '📄', title: 'Analyze an Existing Bill', desc: 'Upload any invoice or statement. Hank identifies the service type and surfaces savings opportunities — automatically.', cta: 'Upload invoice →', color: 'var(--red)', onClick: onOpenAddService },
          { icon: '➕', title: 'Need a New Service?', desc: "Starting from scratch? Tell us what you need and we'll put together a custom quote — internet, phones, payments, security, and more.", cta: 'Request a quote →', color: '#1D4ED8', onClick: onOpenQuote },
          { icon: '⊞', title: 'Browse by Category', desc: 'Explore every service category Candid supports — Network, UCaaS, CCaaS, Security, Cloud, Commerce, IoT, and more.', cta: 'Browse all services →', color: 'var(--green)', onClick: () => {} },
          { icon: '✦', title: 'Ask Hank', desc: "Not sure what you need? Describe your situation to Hank and he'll identify services, find savings, and walk you through your options.", cta: 'Chat with Hank →', color: 'var(--red-light)', dark: true, onClick: () => onViewChange('chat') },
        ].map((c, i) => (
          <div key={i} onClick={c.onClick} style={{ background: c.dark ? 'var(--gray-dark)' : 'var(--white)', border: '1px solid var(--gray-border)', borderRadius: 10, padding: 24, cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'all 0.2s' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${c.color},${c.color}88)` }} />
            <div style={{ marginBottom: 14, fontSize: 22 }}>{c.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.dark ? 'var(--white)' : 'var(--gray-dark)', marginBottom: 6 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: c.dark ? '#888' : 'var(--gray)', lineHeight: 1.6 }}>{c.desc}</div>
            <div style={{ marginTop: 14, fontSize: 11, fontWeight: 600, color: c.color }}>{c.cta}</div>
          </div>
        ))}
      </div>

      {/* Serviceability lookup */}
      <div className="serviceability-card">
        <div className="sa-header">
          <div className="sa-icon">📡</div>
          <div>
            <div className="sa-title">Internet Service Availability Lookup</div>
            <div className="sa-sub">Enter a business address to see what carriers are available and at what price</div>
          </div>
        </div>
        <div className="sa-form">
          <div className="sa-input-wrap" style={{ flex: 2 }}>
            <label>Street Address</label>
            <input className="sa-input" value={saStreet} onChange={e => setSaStreet(e.target.value)} placeholder="123 Main Street" />
          </div>
          <div className="sa-input-wrap">
            <label>City</label>
            <input className="sa-input" value={saCity} onChange={e => setSaCity(e.target.value)} placeholder="Chicago" />
          </div>
          <div className="sa-input-wrap" style={{ flex: '0 0 80px' }}>
            <label>State</label>
            <input className="sa-input" value={saState} onChange={e => setSaState(e.target.value)} placeholder="IL" />
          </div>
          <button className="sa-btn" onClick={onRun}>Check Availability</button>
        </div>

        {saResults && (
          <div className="sa-results show">
            <div className="sa-result-label">Providers available at your address</div>
            <div className="sa-provider-grid">
              {saResults.map((p: any) => (
                <div key={p.name} className="sa-provider">
                  <div className="sa-provider-name">{p.name}</div>
                  <div className="sa-provider-speed">{p.speed}</div>
                  <div className="sa-provider-price">{p.price}</div>
                  <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 4 }}>{p.tag}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ReportsView() {
  const [filter, setFilter] = useState('all');
  const reports = [
    { icon: '📱', name: 'UCaaS / Phone System Analysis', meta: 'RingCentral · Generated Apr 15, 2026', savings: '$500/mo', savingsSub: '$6,000 annually', cat: 'ucaas' },
    { icon: '📡', name: 'Internet Service Benchmark', meta: 'Comcast Business · Generated Apr 10, 2026', savings: '$140/mo', savingsSub: '$1,680 annually', cat: 'internet' },
    { icon: '💳', name: 'Merchant Processing Rate Analysis', meta: 'Square · Generated Apr 8, 2026', savings: '$650/mo', savingsSub: '$7,800 annually', cat: 'merchant' },
    { icon: '💻', name: 'Microsoft 365 License Audit', meta: 'Direct · Generated Apr 5, 2026', savings: '$220/mo', savingsSub: '$2,640 annually', cat: 'microsoft' },
    { icon: '🖥', name: 'IT Managed Services Review', meta: 'Local MSP · Generated Mar 28, 2026', savings: '$205/mo', savingsSub: '$2,460 annually', cat: 'it' },
  ];
  const visible = reports.filter(r => filter === 'all' || r.cat === filter);

  return (
    <>
      <div className="greeting">
        <h2>Reports &amp; <span style={{ color: 'var(--red)' }}>Analysis</span></h2>
        <p>Every service analyzed. Every saving documented. Download or share anytime.</p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['all', 'All Reports'], ['ucaas', 'UCaaS'], ['internet', 'Internet'], ['merchant', 'Merchant'], ['microsoft', 'Microsoft']].map(([val, label]) => (
          <button key={val} className={`filter-btn${filter === val ? ' active' : ''}`} onClick={() => setFilter(val)}>{label}</button>
        ))}
      </div>
      <div className="reports-list">
        {visible.map((r, i) => (
          <div key={i} className="report-item">
            <div className="report-ico">{r.icon}</div>
            <div className="report-info">
              <div className="report-name">{r.name}</div>
              <div className="report-meta">{r.meta}</div>
            </div>
            <div className="report-savings">{r.savings}<span>{r.savingsSub}</span></div>
            <div className="report-dl">⬇</div>
          </div>
        ))}
      </div>
    </>
  );
}

function ChatView({ messages, loading, input, onInputChange, onSend, onSuggestion, messagesRef, userInitials }: {
  messages: ChatMsg[]; loading: boolean; input: string;
  onInputChange: (v: string) => void; onSend: () => void;
  onSuggestion: (t: string) => void; messagesRef: RefObject<HTMLDivElement | null>;
  userInitials: string;
}) {
  const { company } = useContact();
  return (
    <>
      <div className="greeting">
        <h2><span style={{ color: 'var(--red)' }}>Hank</span> — Your AI Assistant</h2>
        <p>Account-aware assistant for {company}. Every session is logged to your Zoho CRM record automatically.</p>
      </div>
      <div className="chat-layout">
        <div className="chat-main">
          <div className="chat-header">
            <div className="chat-avatar">✦</div>
            <div>
              <div className="chat-agent-name">Hank — Candid AI Assistant</div>
              <div className="chat-agent-status">Online — knows your account</div>
            </div>
            <div className="chat-zoho-badge">📋 Syncing to Zoho CRM</div>
          </div>
          <div className="chat-messages" ref={messagesRef}>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.type} fade-up`}>
                <div className={`msg-avatar ${m.type}`}>{m.type === 'bot' ? '✦' : userInitials}</div>
                <div>
                  <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: m.text }} />
                  <div className="msg-time">{m.time}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="msg bot fade-up">
                <div className="msg-avatar bot">✦</div>
                <div><div className="msg-bubble"><div className="typing"><span /><span /><span /></div></div></div>
              </div>
            )}
          </div>
          <div className="chat-suggestions">
            {['Why did my Square bill go up?', 'RingCentral is expiring — what should I do?', "What's my biggest savings opportunity?", 'How much have I saved since joining Candid?', 'Which services are expiring soon?', 'Schedule a call with my specialist'].map(s => (
              <div key={s} className="chip" onClick={() => onSuggestion(s)}>{s}</div>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              className="chat-input"
              placeholder="Ask about your services, bills, contracts, savings..."
              value={input}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSend()}
              disabled={loading}
            />
            <button className="chat-send" onClick={onSend} disabled={loading}>➤</button>
          </div>
          <div className="zoho-note">🔄 This conversation will be saved to your Zoho CRM record as a note after the session ends.</div>
        </div>

        <div className="chat-sidebar">
          <div className="ctx-card">
            <div className="ctx-header">Your Account Snapshot</div>
            <div className="ctx-body">
              {[['Company', company], ['Monthly Spend', '$4,820'], ['Savings Found', '$1,715/mo', 'green'], ['Lifetime Savings', '$8,240', 'green'], ['Fee Status', 'Waived', 'green'], ['Bill Alerts', '1 flagged', 'red'], ['Expiring Soon', '2 services', 'amber']].map(([k, v, cls]) => (
                <div key={k} className="ctx-row"><span>{k}</span><span className={cls || ''}>{v}</span></div>
              ))}
            </div>
            <div className="zoho-sync-row">🔄 Synced with Zoho CRM</div>
          </div>
          <div className="ctx-card">
            <div className="ctx-header">Contract Dates</div>
            <div className="ctx-body">
              {[['RingCentral', 'Jun 1 ⚠', 'red'], ['Comcast', 'Jul 15', 'amber'], ['Square', 'M-t-M', 'green'], ['MS 365', 'Mar 2027', 'green'], ['Google WS', 'Aug 2026', 'amber']].map(([k, v, cls]) => (
                <div key={k} className="ctx-row"><span>{k}</span><span className={cls}>{v}</span></div>
              ))}
            </div>
          </div>
          <div className="ctx-card">
            <div className="ctx-header">Your Specialist</div>
            <div className="ctx-body" style={{ textAlign: 'center', padding: '20px 16px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🤝</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 2 }}>Candid Solutions Team</div>
              <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 14 }}>candidsolutions.com</div>
              <button style={{ width: '100%', background: 'linear-gradient(135deg,var(--red-dark),var(--red-light))', color: 'white', border: 'none', borderRadius: 6, padding: 10, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Schedule a Call</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function AlertsView({ onViewChange }: { onViewChange: (v: any) => void }) {
  return (
    <>
      <div className="greeting">
        <h2>Alerts &amp; <span style={{ color: 'var(--red)' }}>Actions</span></h2>
        <p>4 items need your attention. Prioritized by urgency and savings impact.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[
          { emoji: '⚠️', severity: 'Critical — Bill Anomaly', severityCls: 'var(--red)', borderCls: '#FECACA', borderLeft: 'var(--red)', title: 'Square Merchant Processing — Unexpected $94 Increase', date: 'Detected Apr 22, 2026', body: 'Your Square bill came in at <strong>$1,954</strong> vs. the expected <strong>$1,860</strong>. The $94 overage is due to fax transmissions exceeding your plan\'s monthly limit.', btnTxt: 'Ask AI Assistant', btnColor: 'var(--red)', view: 'chat' },
          { emoji: '📅', severity: 'Critical — Contract Expiring', severityCls: 'var(--red)', borderCls: '#FECACA', borderLeft: 'var(--red)', title: 'RingCentral UCaaS — Expires in 40 Days', date: 'Expires Jun 1, 2026', body: 'Your RingCentral contract for 25 seats expires June 1st. You are currently paying <strong>$1,250/mo</strong> — which is <strong>40% above the current market rate</strong> of $750/mo.', btnTxt: 'Schedule Review Call', btnColor: 'var(--red)', view: 'chat' },
          { emoji: '📡', severity: 'Watch — Renewal Window Opening', severityCls: 'var(--amber)', borderCls: '#FED7AA', borderLeft: 'var(--amber)', title: 'Comcast Business Internet — Renewal Window in 55 Days', date: 'Expires Jul 15, 2026', body: 'Your Comcast Business renewal window opens in approximately 55 days. Current promotions show comparable service available at <strong>$280/mo</strong> vs. your current rate of <strong>$420/mo</strong>.', btnTxt: 'Ask AI Assistant', btnColor: 'var(--amber)', view: 'chat' },
          { emoji: '💡', severity: 'Opportunity — Quick Win', severityCls: 'var(--blue)', borderCls: '#BFDBFE', borderLeft: 'var(--blue)', title: 'Microsoft 365 — 4 Inactive Licenses Detected', date: 'No contract change needed', body: 'Analysis of your Microsoft 365 invoice shows <strong>4 of 22 licenses</strong> have had zero activity for the past 60+ days. Removing these saves <strong>$80/mo immediately</strong>.', btnTxt: 'Have Candid Handle This', btnColor: 'var(--blue)', view: 'chat' },
        ].map((a, i) => (
          <div key={i} style={{ background: 'var(--white)', border: `1px solid ${a.borderCls}`, borderLeft: `4px solid ${a.borderLeft}`, borderRadius: 8, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{a.emoji}</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: a.severityCls, marginBottom: 3 }}>{a.severity}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-dark)' }}>{a.title}</div>
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--gray)', whiteSpace: 'nowrap', marginTop: 2 }}>{a.date}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-mid)', lineHeight: 1.6, marginBottom: 14 }} dangerouslySetInnerHTML={{ __html: a.body }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onViewChange(a.view)} style={{ background: a.btnColor, color: 'white', border: 'none', borderRadius: 6, padding: '8px 18px', fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{a.btnTxt}</button>
              <button style={{ background: 'var(--white)', color: 'var(--gray-dark)', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '8px 18px', fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RoadmapView() {
  const phases = [
    { num: 1, title: 'Phase 1 — Core Platform Foundation', status: 'done', items: [
      { s: 'done', t: 'Design system, CSS variables, typography, component library' },
      { s: 'done', t: 'Login screen with role selector (Admin / Member / Prospect)' },
      { s: 'done', t: 'Admin shell — sidebar navigation, topbar, view routing' },
      { s: 'done', t: 'Dashboard — KPI strip, savings report card, service rows, alert feed' },
      { s: 'done', t: 'Services view — grid layout, filter tabs, Candid vs. external comparison' },
    ]},
    { num: 2, title: 'Phase 2 — AI Layer & Analysis Engine', status: 'active', items: [
      { s: 'done', t: 'Hank AI assistant UI — chat layout, message bubbles, typing indicator' },
      { s: 'done', t: 'Claude API integration — real responses using account context system prompt' },
      { s: 'active', t: 'Bill upload flow — drag-and-drop, file type detection, processing animation' },
      { s: 'active', t: 'Service type detection — keyword matching against filename/content' },
      { s: 'pending', t: 'Real PDF parsing via Claude document API — extract actual bill data' },
    ]},
    { num: 3, title: 'Phase 3 — Member Portal', status: 'active', items: [
      { s: 'done', t: 'Member shell — simplified sidebar, dashboard, services, chat' },
      { s: 'active', t: 'Member-specific views — add service, reports, alerts, settings' },
      { s: 'pending', t: 'Supabase auth — real login, session management, row-level security' },
    ]},
    { num: 4, title: 'Phase 4 — Supabase Backend', status: 'pending', items: [
      { s: 'pending', t: 'Supabase project setup — auth, database schema, RLS policies' },
      { s: 'pending', t: 'Service table — store actual customer service data, not mock data' },
      { s: 'pending', t: 'Bill storage — upload invoices to Supabase Storage, link to services' },
      { s: 'pending', t: 'Alert engine — detect bill anomalies, contract expiry, flag automatically' },
    ]},
  ];

  return (
    <>
      <div className="greeting">
        <h2>Platform <span style={{ color: 'var(--red)' }}>Roadmap</span></h2>
        <p>Full build plan — what's complete, in progress, and planned. Updated after every session.</p>
      </div>
      <div className="build-plan">
        {phases.map(p => (
          <div key={p.num} className="phase-card">
            <div className="phase-header">
              <div className={`phase-num ${p.status}`}>{p.status === 'done' ? '✓' : p.num}</div>
              <div className="phase-title">{p.title}</div>
              <div className={`phase-status ${p.status}`}>{p.status === 'done' ? 'Complete' : p.status === 'active' ? 'In Progress' : 'Planned'}</div>
            </div>
            <div className="phase-body">
              <div className="phase-items">
                {p.items.map((item, i) => (
                  <div key={i} className="phase-item">
                    <span className={`pi-check ${item.s}`}>{item.s === 'done' ? '✓' : item.s === 'active' ? '◉' : '○'}</span>
                    {item.t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SettingsView() {
  const { name, email, company } = useContact();
  const [first0, ...rest] = name.split(/\s+/);
  const lastName = rest.join(' ');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [slackAlerts, setSlackAlerts] = useState(true);

  return (
    <>
      <div className="greeting">
        <h2>Account <span style={{ color: 'var(--red)' }}>Settings</span></h2>
        <p>Manage your profile, subscription, billing, and notification preferences for {company}.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Profile */}
        <div className="card">
          <div className="card-header"><div className="card-title">Profile &amp; Password</div></div>
          <div className="card-body">
            {[{ label: 'First Name', val: first0 ?? '' }, { label: 'Last Name', val: lastName }, { label: 'Email', val: email }, { label: 'Phone', val: '(555) 555-5555' }].map(f => (
              <div key={f.label} className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 7 }}>{f.label}</label>
                <input defaultValue={f.val} style={{ width: '100%', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '10px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--gray-dark)', outline: 'none', background: 'var(--white)' }} />
              </div>
            ))}
            <button style={{ background: 'linear-gradient(135deg,var(--red-dark),var(--red-light))', color: 'white', border: 'none', borderRadius: 6, padding: '10px 20px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save Changes</button>
          </div>
        </div>

        {/* Notifications */}
        <div className="card">
          <div className="card-header"><div className="card-title">Notification Preferences</div></div>
          <div className="card-body">
            {[
              { label: 'Email Alerts', sub: 'Contract expirations, bill anomalies, savings reports', val: emailAlerts, set: setEmailAlerts },
              { label: 'SMS Alerts', sub: 'Urgent-only alerts sent to your mobile number', val: smsAlerts, set: setSmsAlerts },
              { label: 'Slack Notifications', sub: 'Post alerts to your connected Slack workspace', val: slackAlerts, set: setSlackAlerts },
            ].map(n => (
              <div key={n.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--gray-border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 3 }}>{n.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)' }}>{n.sub}</div>
                </div>
                <div
                  onClick={() => n.set((o: boolean) => !o)}
                  style={{ width: 44, height: 24, borderRadius: 12, background: n.val ? 'var(--green)' : 'var(--gray-border)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                >
                  <div style={{ position: 'absolute', top: 2, left: n.val ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription */}
        <div className="card">
          <div className="card-header"><div className="card-title">Subscription &amp; Billing</div></div>
          <div className="card-body">
            <div style={{ background: 'var(--green-light)', border: '1px solid #A7F3D0', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>✓ Platform Fee Currently Waived</div>
              <div style={{ fontSize: 12, color: 'var(--green)' }}>Active Candid client — $25/mo fee is waived as long as you have at least one active managed service.</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-mid)', lineHeight: 1.6, marginBottom: 16 }}>Your Candid Intelligence subscription is <strong>$25/month</strong> (billed monthly) or <strong>$270/year</strong> (save $30). Platform fee is currently <strong>waived</strong> because you have active managed services.</div>
            <button style={{ background: 'var(--white)', color: 'var(--gray-dark)', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '10px 20px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Switch to Annual — Save $30</button>
          </div>
        </div>

        {/* Security */}
        <div className="card">
          <div className="card-header"><div className="card-title">Security</div></div>
          <div className="card-body">
            {['Current Password', 'New Password', 'Confirm New Password'].map(l => (
              <div key={l} style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 7 }}>{l}</label>
                <input type="password" placeholder="••••••••" style={{ width: '100%', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '10px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--gray-dark)', outline: 'none', background: 'var(--white)' }} />
              </div>
            ))}
            <button style={{ background: 'linear-gradient(135deg,var(--red-dark),var(--red-light))', color: 'white', border: 'none', borderRadius: 6, padding: '10px 20px', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Update Password</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── MEMBER-SPECIFIC VIEWS ─────────────────────────────────────
function MemberDashboardView({ onViewChange }: { onViewChange: (v: any) => void }) {
  const { name } = useContact();
  const first = name.split(/\s+/)[0] ?? 'there';
  return (
    <>
      <div className="greeting">
        <h2>Good morning, {first}.</h2>
        <p>Here's your technology cost snapshot — April 2026.</p>
      </div>
      <div className="kpi-strip">
        <div className="kpi red"><div className="kpi-label">Monthly Spend</div><div className="kpi-value">$2,330</div><div className="kpi-sub">across 3 services</div></div>
        <div className="kpi green"><div className="kpi-label">Savings Identified</div><div className="kpi-value">$790</div><div className="kpi-sub">$9,480 annually</div></div>
        <div className="kpi amber"><div className="kpi-label">Expiring Soon</div><div className="kpi-value">1</div><div className="kpi-sub">within 60 days</div></div>
        <div className="kpi blue"><div className="kpi-label">Member Status</div><div className="kpi-value" style={{ fontSize: 18, marginTop: 4 }}>Active</div><div className="kpi-sub">Since Oct 2025</div></div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Alerts &amp; Actions</div><div className="card-action" onClick={() => onViewChange('malerts')}>View all →</div></div>
        <div className="card-body">
          <div className="alert-item"><div className="alert-dot red" /><div><div className="alert-text"><strong>RingCentral expiring in 40 days.</strong> 40% above market rate. Ideal window to renegotiate or transition.</div><div className="alert-time">Action recommended now</div></div></div>
          <div className="alert-item"><div className="alert-dot blue" /><div><div className="alert-text"><strong>4 inactive Microsoft 365 licenses.</strong> Rightsizing saves $80/mo with no contract change required.</div><div className="alert-time">Quick win available now</div></div></div>
        </div>
      </div>
    </>
  );
}

function MemberServicesView({
  onOpenAddService,
  services,
}: {
  onOpenAddService: () => void;
  services: ServiceCardModel[];
}) {
  return (
    <>
      <div className="greeting">
        <h2>
          My <span style={{ color: 'var(--red)' }}>Services</span>
        </h2>
        <p>Your active managed services.</p>
      </div>
      <ServicesGrid services={services} onOpenAddService={onOpenAddService} />
    </>
  );
}

function MemberAddServiceView({ onOpenAddService, onOpenQuote, onViewChange }: any) {
  return (
    <>
      <div className="greeting">
        <h2>Add a <span style={{ color: 'var(--red)' }}>New Service</span></h2>
        <p>Upload a bill or request a quote for a new service.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div onClick={onOpenAddService} style={{ background: 'var(--white)', border: '1px solid var(--gray-border)', borderRadius: 10, padding: 24, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,var(--red-dark),var(--red-light))' }} />
          <div style={{ fontSize: 22, marginBottom: 14 }}>📄</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 6 }}>Analyze an Existing Bill</div>
          <div style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.6 }}>Upload any invoice. Hank identifies savings automatically.</div>
          <div style={{ marginTop: 14, fontSize: 11, fontWeight: 600, color: 'var(--red)' }}>Upload invoice →</div>
        </div>
        <div onClick={onOpenQuote} style={{ background: 'var(--white)', border: '1px solid var(--gray-border)', borderRadius: 10, padding: 24, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#1D4ED8,#60A5FA)' }} />
          <div style={{ fontSize: 22, marginBottom: 14 }}>➕</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 6 }}>Need a New Service?</div>
          <div style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.6 }}>Request a custom quote for a new service.</div>
          <div style={{ marginTop: 14, fontSize: 11, fontWeight: 600, color: '#1D4ED8' }}>Request a quote →</div>
        </div>
      </div>
    </>
  );
}
