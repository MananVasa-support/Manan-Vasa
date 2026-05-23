import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { NotificationChannels } from "@/components/profile/notification-channels";
import { EnablePushButton } from "@/components/pwa/enable-push-button";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await requireUser();
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="max-w-2xl">
          <h1 className="font-serif text-3xl text-[#0F172A] mb-1">Your profile</h1>
          <p className="text-[15px] text-[#64748B] mb-6">{me.email}</p>
          <EditProfileForm
            initial={{
              name: me.name,
              avatarUrl: me.avatarUrl,
            }}
          />
          <div className="mt-6">
            <NotificationChannels
              current={{
                emailOptIn: me.emailOptIn,
                slackOptIn: me.slackOptIn,
                whatsappOptedIn: me.whatsappOptedIn,
                whatsappPhone: me.whatsappPhone,
              }}
            />
          </div>
          <div className="mt-6 rounded-lg border border-[#E2E8F0] bg-white p-5">
            <h2 className="text-[13px] uppercase tracking-wide text-[#94A3B8] font-bold mb-2">
              Browser push
            </h2>
            <p className="text-[15px] text-[#475569] mb-3" style={{ lineHeight: 1.55 }}>
              Get real-time notifications on this device, even when the tab
              isn&apos;t open. Per-device — enable on every browser you use.
            </p>
            <EnablePushButton />
          </div>
        </div>
      </main>
      <DashboardFooter />
    </>
  );
}
