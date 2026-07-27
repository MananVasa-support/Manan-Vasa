import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, SlidersHorizontal, Eye } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PolicyEditor } from "@/components/hr/policies/policy-editor";

export const dynamic = "force-dynamic";

/**
 * The admin-facing Policy-CMS editor: `/hr/policies/<key>/edit`. Guards to a
 * workspace HR admin (super-admins always pass), then hands off to the client
 * <PolicyEditor>, which loads the current version, lets an admin edit the body
 * and publish a new version behind the secondary Admin PIN. The publish reset
 * requests a re-sign from every active employee.
 */
export default async function PolicyEditPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const me = await requireHrStaff();
  const { key } = await params;
  const superAdmin = isSuperAdmin(me.email);

  return (
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4 print:hidden">
        <div className="justify-self-start">
          <Link
            href={`/hr/policies/${key}` as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{
              background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)",
              boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)",
            }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">Back to policy</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <span className="justify-self-center inline-flex items-center gap-1.5 truncate text-[15px] font-extrabold tracking-tight text-ink-strong">
          <SlidersHorizontal size={15} strokeWidth={2.4} style={{ color: "#A80400" }} aria-hidden />
          <span className="truncate">Policy editor</span>
        </span>
        <div className="justify-self-end">
          <Link
            href={`/hr/policies/${key}` as Route}
            className="group inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-transform hover:-translate-y-0.5 max-md:px-3"
            style={{ boxShadow: "0 10px 24px -16px rgba(24,24,27,0.55)" }}
          >
            <Eye size={15} strokeWidth={2.4} style={{ color: "#A80400" }} />
            <span className="max-md:hidden">View live</span>
            <span className="md:hidden">View</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-6 max-md:px-3 pt-8 pb-24">
        <PolicyEditor policyKey={key} isSuperAdmin={superAdmin} />
      </main>
    </div>
  );
}
