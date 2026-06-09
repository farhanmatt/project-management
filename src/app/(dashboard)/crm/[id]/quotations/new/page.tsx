import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCrmLead, getCrmLeadActivityLogs } from "@/actions/crm.actions";
import { getCrmProjectTypes } from "@/actions/crm-project-types.actions";
import { CrmQuotationForm } from "@/components/crm/crm-quotation-form";
import { CrmQuotationNav } from "@/components/crm/crm-quotation-nav";
import { CrmModuleTopNav } from "@/components/crm/crm-module-top-nav";
import { CrmLeadChatter } from "@/components/crm/crm-lead-chatter";

interface NewCrmQuotationPageProps {
  params: Promise<{ id: string }>;
}

export default async function NewCrmQuotationPage({ params }: NewCrmQuotationPageProps) {
  const { id } = await params;
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== "ADMIN" && !session.user.moduleAccess.includes("CRM"))
  ) {
    redirect("/dashboard");
  }

  const lead = await getCrmLead(id);
  const projectTypes = await getCrmProjectTypes();
  const activityLogs = await getCrmLeadActivityLogs(id, 30);
  if (!lead) {
    notFound();
  }

  const serializedActivityLogs = activityLogs.map((log) => ({
    id: log.id,
    action: log.action,
    createdAt: log.createdAt.toISOString(),
    createdByName: log.createdBy?.name || null,
    metadata:
      log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : null,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <CrmModuleTopNav activeItem="pipeline" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b bg-white/95 px-0 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex flex-wrap items-center gap-x-4 gap-y-1">
              <h1 className="text-2xl font-semibold">New Quotation</h1>
              <p className="text-sm text-slate-600">Lead: {lead.title}</p>
            </div>
            <CrmQuotationNav leadId={id} />
          </div>
        </div>

        <div className="pt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:divide-x">
            <div className="min-w-0 lg:pr-4">
              <CrmQuotationForm lead={lead} salespersonName={session.user.name || "Sales"} projectTypes={projectTypes} />
            </div>
            <div className="min-w-0 lg:pl-4">
              <div className="rounded-md border bg-white">
                <CrmLeadChatter
                  leadId={lead.id}
                  currentUserName={session.user.name || "User"}
                  initialLogs={serializedActivityLogs}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
