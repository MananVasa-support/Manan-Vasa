import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { DocumentLibrary } from "@/components/documents/document-library";
import { listDocuments } from "@/lib/queries/documents";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  await requireUser();
  const documents = await listDocuments();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[860px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <h1 className="text-display-lg text-ink-strong">Documents</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Shared library of files. Title is required; description optional.
            Upload, download, edit, replace, or delete.
          </p>
        </header>
        <DocumentLibrary documents={documents} />
      </main>
      <DashboardFooter />
    </>
  );
}
