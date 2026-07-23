"use client";

import { Fragment } from "react";
import { COMPANY_NAME } from "@/lib/hr-docs/merge";

/**
 * DocFrame — a faithful on-screen approximation of the fixed Altus letter frame
 * the pdfkit renderer draws (letterhead + resolved body + signature block). Used
 * by the compose live-preview and the template editor. The REAL PDF is rendered
 * server-side by lib/hr-docs/render.ts; this mirrors its layout so admins see
 * what they'll issue.
 */
export function DocFrame({
  title,
  body,
  content,
  signature,
  recipientName,
  hrName,
  date,
}: {
  title: string;
  body: string;
  content: string;
  signature: string;
  recipientName?: string;
  hrName?: string;
  date?: string;
}) {
  const centered = content === "certificate";
  return (
    <div
      className="mx-auto w-full max-w-[640px] bg-white text-[#111]"
      style={{ boxShadow: "0 10px 30px -18px rgba(15,23,42,0.45), 0 0 0 1px rgba(0,0,0,0.06)", borderRadius: 6, colorScheme: "light" }}
    >
      {/* letterhead */}
      <div className="flex items-center justify-between px-8 pt-7 pb-4" style={{ borderBottom: "2px solid #E10600" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.01em", color: "#A80400" }}>
            {COMPANY_NAME}
          </div>
          <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b7280", marginTop: 2 }}>
            Human Resources
          </div>
        </div>
        {date && !centered ? <div style={{ fontSize: 11.5, color: "#374151" }}>{date}</div> : null}
      </div>

      {/* body */}
      <div className="px-8 py-7" style={{ minHeight: 220 }}>
        <h3
          className={centered ? "text-center" : ""}
          style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 800, fontSize: centered ? 22 : 16, letterSpacing: "-0.01em", color: "#111", marginBottom: 14 }}
        >
          {title}
        </h3>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#1f2937" }}>
          <Body body={body} centered={centered} />
        </div>

        {/* signature block */}
        <SignatureBlock signature={signature} recipientName={recipientName} hrName={hrName} centered={centered} />
      </div>
    </div>
  );
}

/** Minimal markdown-ish rendering: blank-line paragraphs, #/## headings, - bullets, **bold**. */
function Body({ body, centered }: { body: string; centered: boolean }) {
  const trimmed = body.trim();
  if (!trimmed) {
    return <p style={{ color: "#9ca3af", fontStyle: "italic" }}>The body appears here as you fill the fields.</p>;
  }
  const blocks = trimmed.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isBullets = lines.every((l) => /^\s*[-*]\s+/.test(l));
        if (isBullets) {
          return (
            <ul key={i} style={{ margin: "0 0 10px", paddingLeft: 18, listStyle: "disc" }}>
              {lines.map((l, j) => (
                <li key={j} style={{ marginBottom: 3 }}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        const h1 = block.match(/^#\s+(.*)$/);
        const h2 = block.match(/^##\s+(.*)$/);
        if (h2) return <h5 key={i} style={{ fontWeight: 700, fontSize: 13, margin: "12px 0 6px" }}>{inline(h2[1]!)}</h5>;
        if (h1) return <h4 key={i} style={{ fontWeight: 800, fontSize: 14.5, margin: "12px 0 6px" }}>{inline(h1[1]!)}</h4>;
        return (
          <p key={i} style={{ margin: "0 0 10px", textAlign: centered ? "center" : "left" }}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {inline(l)}
                {j < lines.length - 1 ? <br /> : null}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

/** Render **bold** inline within a line. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

function SignatureBlock({
  signature,
  recipientName,
  hrName,
  centered,
}: {
  signature: string;
  recipientName?: string;
  hrName?: string;
  centered: boolean;
}) {
  if (centered) {
    return (
      <div style={{ marginTop: 34, textAlign: "center" }}>
        <Line width={200} />
        <div style={{ fontSize: 11.5, color: "#374151", marginTop: 4 }}>Authorised Signatory · {COMPANY_NAME}</div>
      </div>
    );
  }
  if (signature === "esign") {
    return (
      <div style={{ marginTop: 34, display: "flex", justifyContent: "space-between", gap: 24 }}>
        <div>
          <Line width={170} />
          <div style={{ fontSize: 11.5, color: "#374151", marginTop: 4 }}>{recipientName || "Employee"}</div>
          <div style={{ fontSize: 10.5, color: "#9ca3af" }}>Signature (DigiLocker e-sign)</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <Line width={170} />
          <div style={{ fontSize: 11.5, color: "#374151", marginTop: 4 }}>{hrName || "For Altus Corp"}</div>
          <div style={{ fontSize: 10.5, color: "#9ca3af" }}>Human Resources</div>
        </div>
      </div>
    );
  }
  if (signature === "acknowledge") {
    return (
      <div style={{ marginTop: 34 }}>
        <div style={{ fontSize: 11.5, color: "#374151", marginBottom: 10 }}>
          I acknowledge that I have read and understood the above.
        </div>
        <Line width={200} />
        <div style={{ fontSize: 11.5, color: "#374151", marginTop: 4 }}>{recipientName || "Employee"}</div>
      </div>
    );
  }
  // none → authorised signatory
  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ fontSize: 12, color: "#1f2937", marginBottom: 22 }}>For {COMPANY_NAME},</div>
      <Line width={190} />
      <div style={{ fontSize: 11.5, color: "#374151", marginTop: 4 }}>{hrName || "Authorised Signatory"}</div>
      <div style={{ fontSize: 10.5, color: "#9ca3af" }}>Human Resources</div>
    </div>
  );
}

function Line({ width }: { width: number }) {
  return <div style={{ width, maxWidth: "100%", height: 1, background: "#9ca3af" }} />;
}
