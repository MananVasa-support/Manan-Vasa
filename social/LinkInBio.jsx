// Link-in-Bio — Manan Vasa
// Magazine-cover editorial: Playfair + Inter, ink + red (#D4152A),
// editorial list links with hairline dividers, newsletter hero, pull-quote rotation.

const MV = {
  ink: '#0B0B0C',
  red: '#D4152A',
  redDeep: '#A80E20',
  mute: '#6B6A68',
  soft: '#8B8A87',
  hair: 'rgba(11,11,12,0.14)',
  hairSoft: 'rgba(11,11,12,0.08)',
  paper: '#FFFFFF',
  cream: '#F7F4EE',
};

const MV_DARK = {
  ink: '#F4F1EC',
  red: '#FF4A5F',
  redDeep: '#D4152A',
  mute: '#9A9892',
  soft: '#6B6A66',
  hair: 'rgba(244,241,236,0.16)',
  hairSoft: 'rgba(244,241,236,0.08)',
  paper: '#0B0B0C',
  cream: '#141311',
};

// ─── Icons (hairline SVG, inherit currentColor) ────────────────────────────
const Ico = {
  Arrow: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 20} height={p.s || 20} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  YT: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
      <path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
    </svg>
  ),
  IG: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  ),
  FB: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M14 7h2V4h-2a3 3 0 0 0-3 3v2H9v3h2v8h3v-8h2.5l.5-3H14V7.5c0-.3.2-.5.5-.5H14z" />
    </svg>
  ),
  LI: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="7.5" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <path d="M6.5 11v7M10.5 18v-4.2c0-1.2 1-2.3 2.3-2.3s2.2 1.1 2.2 2.3V18M10.5 11v7" />
    </svg>
  ),
  Map: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M12 3c3.5 0 6 2.7 6 6 0 4.5-6 12-6 12S6 13.5 6 9c0-3.3 2.5-6 6-6z" />
      <circle cx="12" cy="9" r="2.2" />
    </svg>
  ),
  Book: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4V4z" />
      <path d="M20 4h-3a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h4V4z" />
    </svg>
  ),
  Globe: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </svg>
  ),
  Mail: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 18} height={p.s || 18} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  ),
  Share: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 4v11M12 4l-3.5 3.5M12 4l3.5 3.5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  ),
  Sun: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </svg>
  ),
  Moon: (p) => (
    <svg viewBox="0 0 24 24" width={p.s || 16} height={p.s || 16} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  ),
};

// ─── Links data ────────────────────────────────────────────────────────────
const LINKS = [
  {
    group: 'Work with me',
    items: [
      {
        label: 'Productivity Shastra',
        detail: 'Flagship cohort · next batch opens May',
        kicker: 'Program',
        icon: Ico.Book,
        href: '#',
        emphasis: true,
      },
      {
        label: 'mananvasa.com',
        detail: 'Coaching, speaking, and the full archive',
        kicker: 'Site',
        icon: Ico.Globe,
        href: 'https://mananvasa.com',
      },
    ],
  },
  {
    group: 'Watch & listen',
    items: [
      {
        label: 'YouTube',
        detail: 'Full episodes, frameworks, and keynote cuts',
        kicker: 'Subscribe · 184K',
        icon: Ico.YT,
        href: '#',
      },
      {
        label: 'Instagram',
        detail: 'Daily micro-lessons. No gyaan, only gain.',
        kicker: 'Follow · 312K',
        icon: Ico.IG,
        href: '#',
      },
    ],
  },
  {
    group: 'Elsewhere',
    items: [
      { label: 'LinkedIn', detail: 'Essays & long-form notes for operators', kicker: 'Connect', icon: Ico.LI, href: '#' },
      { label: 'Facebook', detail: 'Community broadcasts & replays', kicker: 'Follow', icon: Ico.FB, href: '#' },
      { label: 'Altus HQ · Mumbai', detail: 'Andheri East · by appointment only', kicker: 'Visit', icon: Ico.Map, href: '#' },
    ],
  },
];

// Rotating pull-quotes (from the mug canon)
const QUOTES = [
  { lead: 'Focus means', red: 'Killing all other Options.' },
  { lead: '', red: 'Be the Player.', tail: 'Spectator never influences the outcome.' },
  { lead: 'Survival and', red: 'Growth', tail: 'cannot coexist.' },
  { lead: '', red: 'No Purpose, No Life.' },
  { lead: 'Your word is expensive —', red: 'give it wisely.' },
];

// ─── Layout primitives ─────────────────────────────────────────────────────
function Rule({ c, strong }) {
  return <div style={{ height: 1, background: strong ? c.hair : c.hairSoft, width: '100%' }} />;
}

function Kicker({ children, c, color }) {
  return (
    <span style={{
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
      fontWeight: 600, color: color || c.red,
    }}>{children}</span>
  );
}

// ─── Masthead (magazine cover) ─────────────────────────────────────────────
function Masthead({ c, onToggleTheme, dark, compact }) {
  const photoSize = compact ? 108 : 128;
  return (
    <div style={{ position: 'relative' }}>
      {/* Top rail: ISSUE tag + dateline + theme toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: compact ? '14px 22px 10px' : '22px 40px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: c.red, display: 'inline-block' }} />
          <span style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
            fontWeight: 600, color: c.ink,
          }}>The Vasa Dispatch · Vol. XIX</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase',
            color: c.mute, fontWeight: 500,
          }}>MUMBAI · EST. 2006</span>
          <button onClick={onToggleTheme} title="Toggle theme" style={{
            all: 'unset', cursor: 'pointer', width: 26, height: 26, borderRadius: 13,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${c.hair}`, color: c.ink,
          }}>
            {dark ? <Ico.Sun s={13} /> : <Ico.Moon s={13} />}
          </button>
        </div>
      </div>

      <Rule c={c} strong />

      {/* Wordmark row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: compact ? '16px 22px 8px' : '26px 40px 14px',
      }}>
        <div style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontWeight: 700, fontSize: compact ? 20 : 26, letterSpacing: '0.02em', color: c.ink,
        }}>MANAN VASA</div>
        <div style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontStyle: 'italic', fontSize: compact ? 13 : 15, color: c.mute,
        }}>@mananvasa</div>
      </div>

      <Rule c={c} />

      {/* Hero block — photo + headline */}
      <div style={{
        padding: compact ? '22px 22px 18px' : '36px 40px 28px',
        display: 'grid', gridTemplateColumns: compact ? '108px 1fr' : '150px 1fr',
        gap: compact ? 18 : 28, alignItems: 'center',
      }}>
        {/* circular photo placeholder */}
        <div style={{
          width: photoSize, height: photoSize, borderRadius: photoSize / 2,
          position: 'relative', overflow: 'hidden',
          background: dark ? '#1a1916' : '#EFEAE2',
          border: `1px solid ${c.hair}`,
          flexShrink: 0,
        }}>
          {/* placeholder face — abstract geometric portrait */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(circle at 50% 38%, ${dark ? '#2a2622' : '#D9CFBF'} 0%, ${dark ? '#1a1916' : '#EFEAE2'} 65%)`,
          }} />
          {/* red star mark, small, bottom-right */}
          <img src="assets/altus-star.jpg" alt="" style={{
            position: 'absolute', right: -12, bottom: -12, width: photoSize * 0.55,
            mixBlendMode: dark ? 'screen' : 'multiply',
            opacity: 0.95, pointerEvents: 'none',
          }} />
          {/* photo stamp label */}
          <div style={{
            position: 'absolute', left: 10, top: 10,
            fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: c.mute, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
          }}>MV</div>
        </div>

        <div>
          <div style={{ marginBottom: 10 }}>
            <Kicker c={c}>Cover story · No gyaan, only gain</Kicker>
          </div>
          <div style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: compact ? 42 : 64, lineHeight: 0.95, fontWeight: 400,
            letterSpacing: '-0.025em', color: c.ink,
          }}>
            Productivity,{' '}
            <span style={{ color: c.red, fontStyle: 'italic' }}>practiced.</span>
          </div>
        </div>
      </div>

      <Rule c={c} strong />

      {/* Deck — standfirst */}
      <div style={{ padding: compact ? '14px 22px 18px' : '22px 40px 28px' }}>
        <div style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontSize: compact ? 16 : 19, lineHeight: 1.4, color: c.ink, fontWeight: 400,
        }}>
          Productivity coach to <span style={{ color: c.red, fontWeight: 500 }}>20,000+ entrepreneurs</span>.
          Personal mentor to <span style={{ color: c.red, fontWeight: 500 }}>600+ operators</span>.
          Nineteen years of breakthrough results —
          <span style={{ fontStyle: 'italic' }}> one promise.</span>
        </div>

        {/* byline strip */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 14, marginTop: compact ? 16 : 20,
        }}>
          <div style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: compact ? 14 : 16, fontStyle: 'italic', color: c.ink,
          }}>— Manan Vasa</div>
          <div style={{ flex: 1, borderTop: `1px solid ${c.hair}`, transform: 'translateY(-4px)' }} />
          <div style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase',
            color: c.red, fontWeight: 600,
          }}>#NoGyaanOnlyGain</div>
        </div>
      </div>
    </div>
  );
}

// ─── Featured: Newsletter signup ───────────────────────────────────────────
function FeatureNewsletter({ c, compact }) {
  const [email, setEmail] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  function submit(e) {
    e.preventDefault();
    if (!email.includes('@')) return;
    setSubmitted(true);
  }

  return (
    <div style={{
      padding: compact ? '22px 22px' : '32px 40px',
      background: c.ink, color: c.paper, position: 'relative', overflow: 'hidden',
    }}>
      {/* feature label */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: compact ? 14 : 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: c.red }} />
          <span style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
            fontWeight: 600, color: c.red,
          }}>Featured · Thursday letter</span>
        </div>
        <span style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.5)',
        }}>Issue №47</span>
      </div>

      <div style={{
        fontFamily: '"Playfair Display", Georgia, serif',
        fontSize: compact ? 30 : 44, lineHeight: 1.02, letterSpacing: '-0.02em',
        fontWeight: 400, marginBottom: compact ? 12 : 18,
      }}>
        98% don't know on Monday what they'll do <span style={{ color: c.red, fontStyle: 'italic' }}>Thursday.</span>
      </div>

      <div style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: compact ? 13 : 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.72)',
        maxWidth: 520, marginBottom: compact ? 18 : 22,
      }}>
        A weekly dispatch for the 2%. One idea, one framework, one prompt — sent Thursday, 7am IST. No fluff. Unsubscribe anytime.
      </div>

      {/* Form */}
      {!submitted ? (
        <form onSubmit={submit} style={{
          display: 'flex', alignItems: 'stretch',
          border: '1px solid rgba(255,255,255,0.3)',
          background: 'rgba(255,255,255,0.04)',
        }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{
              all: 'unset', flex: 1, padding: compact ? '12px 14px' : '14px 18px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: compact ? 13 : 14, color: '#fff',
            }}
          />
          <button type="submit" style={{
            all: 'unset', cursor: 'pointer',
            padding: compact ? '12px 16px' : '14px 22px',
            background: c.red, color: '#fff',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: compact ? 11 : 12, letterSpacing: '0.22em', textTransform: 'uppercase',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            Subscribe <Ico.Arrow s={14} />
          </button>
        </form>
      ) : (
        <div style={{
          padding: compact ? '12px 14px' : '14px 18px',
          border: `1px solid ${c.red}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            width: 18, height: 18, borderRadius: 9, background: c.red,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 11, fontWeight: 700,
          }}>✓</span>
          <span style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontStyle: 'italic', fontSize: compact ? 14 : 16,
          }}>
            You're in. First letter lands <span style={{ color: c.red }}>Thursday, 7am</span>.
          </span>
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginTop: compact ? 14 : 18,
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: 10,
        letterSpacing: '0.22em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.5)', fontWeight: 500,
      }}>
        <span>41,208 readers</span>
        <span style={{ width: 3, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.4)' }} />
        <span>4.8★ avg rating</span>
        <span style={{ width: 3, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.4)' }} />
        <span>Thursdays · 7am IST</span>
      </div>
    </div>
  );
}

// ─── Editorial link row ────────────────────────────────────────────────────
function LinkRow({ item, c, isLast, compact }) {
  const [hover, setHover] = React.useState(false);
  const Icon = item.icon;
  return (
    <a
      href={item.href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '26px 1fr auto' : '30px 1fr auto',
        alignItems: 'center',
        gap: compact ? 14 : 18,
        padding: compact ? '14px 22px' : '20px 40px',
        borderBottom: isLast ? 'none' : `1px solid ${c.hairSoft}`,
        textDecoration: 'none', color: c.ink,
        background: hover ? (item.emphasis ? c.red : c.cream) : 'transparent',
        transition: 'background 140ms ease',
        position: 'relative',
      }}
    >
      {/* icon */}
      <div style={{
        color: hover && item.emphasis ? '#fff' : (item.emphasis ? c.red : c.ink),
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
      }}>
        <Icon s={compact ? 17 : 19} />
      </div>

      {/* label block */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: compact ? 20 : 26, fontWeight: 400,
            letterSpacing: '-0.01em', lineHeight: 1.1,
            color: hover && item.emphasis ? '#fff' : c.ink,
            fontStyle: item.emphasis ? 'italic' : 'normal',
          }}>
            {item.label}
          </div>
          {item.emphasis && (
            <span style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 9, letterSpacing: '0.26em', textTransform: 'uppercase',
              fontWeight: 700, color: hover ? '#fff' : c.red,
              border: `1px solid ${hover ? 'rgba(255,255,255,0.5)' : c.red}`,
              padding: '2px 6px',
            }}>New</span>
          )}
        </div>
        <div style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: compact ? 11.5 : 13, lineHeight: 1.4, marginTop: 2,
          color: hover && item.emphasis ? 'rgba(255,255,255,0.85)' : c.mute,
        }}>
          {item.detail}
        </div>
      </div>

      {/* kicker + arrow */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: compact ? 8 : 12,
        color: hover && item.emphasis ? '#fff' : (hover ? c.red : c.mute),
      }}>
        <span style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase',
          fontWeight: 600,
          display: compact ? 'none' : 'inline',
        }}>{item.kicker}</span>
        <span style={{
          transform: hover ? 'translateX(4px)' : 'translateX(0)',
          transition: 'transform 160ms ease',
          display: 'inline-flex',
        }}>
          <Ico.Arrow s={compact ? 15 : 17} />
        </span>
      </div>
    </a>
  );
}

function LinkGroup({ group, c, compact }) {
  return (
    <div>
      {/* section header — magazine chapter */}
      <div style={{
        padding: compact ? '18px 22px 10px' : '28px 40px 14px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontStyle: 'italic', fontSize: compact ? 18 : 22, fontWeight: 400,
          color: c.ink,
        }}>{group.group}</div>
        <div style={{ flex: 1, borderTop: `1px solid ${c.hair}`, transform: 'translateY(-4px)' }} />
        <div style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
          fontWeight: 600, color: c.mute,
        }}>§ {String(group.items.length).padStart(2, '0')}</div>
      </div>
      <Rule c={c} />
      {group.items.map((it, i) => (
        <LinkRow key={it.label} item={it} c={c} isLast={i === group.items.length - 1} compact={compact} />
      ))}
      <Rule c={c} strong />
    </div>
  );
}

// ─── Rotating pull-quote ───────────────────────────────────────────────────
function QuoteStrip({ c, compact }) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % QUOTES.length), 4200);
    return () => clearInterval(t);
  }, []);
  const q = QUOTES[i];
  return (
    <div style={{
      padding: compact ? '24px 22px' : '36px 40px',
      background: c.cream,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: compact ? 12 : 18, left: compact ? 22 : 40,
        fontFamily: '"Playfair Display", Georgia, serif',
        fontSize: compact ? 64 : 96, lineHeight: 0.7, color: c.red,
        fontStyle: 'italic', opacity: 0.25, pointerEvents: 'none',
      }}>"</div>
      <div style={{
        fontFamily: '"Playfair Display", Georgia, serif',
        fontSize: compact ? 22 : 30, lineHeight: 1.2, fontWeight: 400,
        letterSpacing: '-0.01em', color: c.ink,
        paddingLeft: compact ? 18 : 28,
        minHeight: compact ? 60 : 90,
      }}>
        {q.lead && <span>{q.lead} </span>}
        <span style={{ color: c.red, fontStyle: 'italic' }}>{q.red}</span>
        {q.tail && <span> {q.tail}</span>}
      </div>
      <div style={{
        display: 'flex', gap: 6, marginTop: compact ? 14 : 20,
        paddingLeft: compact ? 18 : 28,
      }}>
        {QUOTES.map((_, n) => (
          <span key={n} style={{
            width: n === i ? 18 : 6, height: 2,
            background: n === i ? c.red : c.hair,
            transition: 'width 300ms ease',
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── Footer / colophon ─────────────────────────────────────────────────────
function Colophon({ c, compact }) {
  return (
    <div style={{
      padding: compact ? '20px 22px 24px' : '28px 40px 36px',
      background: c.paper,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase',
          fontWeight: 600, color: c.mute,
        }}>
          © 2026 Altus Corp · All rights reserved
        </div>
        <div style={{
          display: 'flex', gap: compact ? 12 : 18, alignItems: 'center',
          fontFamily: 'Inter, system-ui, sans-serif', fontSize: 10,
          letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 600,
          color: c.ink,
        }}>
          <a href="#" style={{ color: c.ink, textDecoration: 'none' }}>Press</a>
          <a href="#" style={{ color: c.ink, textDecoration: 'none' }}>Contact</a>
          <span style={{ color: c.red }}>Mumbai</span>
        </div>
      </div>
      <div style={{
        marginTop: compact ? 14 : 20,
        fontFamily: '"Playfair Display", Georgia, serif',
        fontStyle: 'italic', fontSize: compact ? 11 : 13, color: c.mute, textAlign: 'center',
      }}>
        Set in Playfair Display & Inter. Printed digitally in Mumbai — served everywhere.
      </div>
    </div>
  );
}

// ─── Page shell ────────────────────────────────────────────────────────────
function LinkInBioPage({ dark, onToggleTheme, compact = false }) {
  const c = dark ? MV_DARK : MV;
  return (
    <div style={{
      background: c.paper, color: c.ink, width: '100%', minHeight: '100%',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <Masthead c={c} dark={dark} onToggleTheme={onToggleTheme} compact={compact} />

      <FeatureNewsletter c={c} compact={compact} />

      <Rule c={c} strong />

      {LINKS.map((g) => <LinkGroup key={g.group} group={g} c={c} compact={compact} />)}

      <QuoteStrip c={c} compact={compact} />

      <Rule c={c} strong />

      <Colophon c={c} compact={compact} />
    </div>
  );
}

Object.assign(window, { LinkInBioPage, MV, MV_DARK });
