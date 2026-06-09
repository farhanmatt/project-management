import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, canAccessAction } from "@/lib/auth";
import {
  getCrmQuotation,
  getQuotationInvoice,
  getQuotationPaymentById,
} from "@/actions/quotation.actions";
import { getCrmLead } from "@/actions/crm.actions";
import { CrmDetailPageShell } from "@/components/crm/crm-detail-page-shell";
import { CrmPaymentDetailActions } from "@/components/crm/crm-payment-detail-actions";
import { SalesSectionNav } from "@/components/crm/sales-section-nav";
import { Button } from "@/components/ui/button";
import { resolveInternalBackHref, withInternalBackHref } from "@/lib/internal-navigation";

interface CrmPaymentDetailPageProps {
  params: Promise<{ id: string; quotationId: string; paymentId: string }>;
  searchParams?: Promise<{ from?: string }>;
}

function parsePaymentNotes(notes: string | null) {
  return (notes || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf(":");
      if (separatorIndex === -1) {
        return { label: "Note", value: part };
      }
      return {
        label: part.slice(0, separatorIndex).trim(),
        value: part.slice(separatorIndex + 1).trim(),
      };
    });
}

export default async function CrmPaymentDetailPage({ params, searchParams }: CrmPaymentDetailPageProps) {
  const { id, quotationId, paymentId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== "ADMIN" && !session.user.moduleAccess.includes("SALES"))
  ) {
    redirect(`/crm/${id}/quotations/${quotationId}/invoice`);
  }

  const [lead, quotation, invoice, payment] = await Promise.all([
    getCrmLead(id),
    getCrmQuotation(quotationId),
    getQuotationInvoice(quotationId),
    getQuotationPaymentById(paymentId),
  ]);

  if (!lead || !quotation || quotation.crmLeadId !== id || !payment || payment.quotationId !== quotationId) {
    notFound();
  }

  const noteRows = parsePaymentNotes(payment.notes);
  const canDeletePayment = canAccessAction({
    role: session.user.role,
    permissions: session.user.permissions,
    action: "DELETE",
    module: "SALES",
  });
  const canEditPayment = canAccessAction({
    role: session.user.role,
    permissions: session.user.permissions,
    action: "UPDATE",
    module: "SALES",
  });
  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
  const paymentCreatedLabel = new Date(payment.createdAt).toLocaleString();
  const paymentUpdatedLabel = new Date(payment.updatedAt).toLocaleString();
  const quotationTotalLabel = currency.format(Number(payment.quotationTotalAmount || quotation.totalAmount || 0));
  const invoiceBalanceLabel = currency.format(Number(invoice?.balanceAmount ?? payment.invoiceBalanceAmount ?? 0));
  const paidAmountLabel = currency.format(Number(payment.paidAmount || 0));
  const invoiceStatusLabel = invoice ? "Created" : "Pending";

  const paymentInputLabel =
    payment.paymentType === "PERCENTAGE"
      ? `${Number(payment.percentage || 0).toFixed(2)}%`
      : payment.paymentType === "MONTHLY"
        ? `${currency.format(Number(payment.amount || 0))} x ${payment.months || 1}`
        : currency.format(Number(payment.amount || 0));
  const invoiceHref = resolveInternalBackHref(
    resolvedSearchParams.from,
    `/crm/${id}/quotations/${quotationId}/invoice`,
  );
  const quotationHref = withInternalBackHref(`/crm/${id}/quotations/${quotationId}`, invoiceHref);

  return (
    <CrmDetailPageShell navigation={<SalesSectionNav activeTab="to-invoice" embedded />}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Payment Detail</h1>
          <p className="text-sm text-slate-600">{quotation.quotationNo}</p>
          <p className="text-sm text-slate-600">{quotation.projectTitle}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button asChild variant="outline">
            <Link href={invoiceHref}>Back to Invoice</Link>
          </Button>
          <div className="rounded-md border bg-slate-50 px-3 py-1 text-sm font-medium">{payment.paymentType}</div>
          <CrmPaymentDetailActions
            canDelete={canDeletePayment}
            canEdit={canEditPayment}
            backHref={invoiceHref}
            paymentId={payment.id}
            leadId={id}
            quotationId={quotationId}
            quotationNo={quotation.quotationNo}
            paymentType={payment.paymentType}
            amount={Number(payment.amount || 0)}
            percentage={payment.percentage}
            months={payment.months}
            notesText={payment.notes || ""}
            paidAmountLabel={paidAmountLabel}
            recordedAtLabel={paymentCreatedLabel}
            customerName={quotation.clientName}
            projectTitle={quotation.projectTitle}
            notes={noteRows}
          />
        </div>
      </div>

      <div className="rounded-md border bg-white p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Customer</p>
            <p className="font-semibold text-slate-900">{quotation.clientName}</p>
            <p className="text-sm text-slate-600">{quotation.clientEmail}</p>
            <p className="text-sm text-slate-600">{lead.phone || "-"}</p>
            <p className="text-sm text-slate-600">{quotation.projectTitle}</p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3 border-b pb-1">
              <span className="text-slate-500">Recorded On</span>
              <span className="text-right">{paymentCreatedLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-1">
              <span className="text-slate-500">Updated On</span>
              <span className="text-right">{paymentUpdatedLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-1">
              <span className="text-slate-500">Payment Type</span>
              <span className="text-right">{payment.paymentType}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-1">
              <span className="text-slate-500">Input Value</span>
              <span className="text-right">{paymentInputLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-1">
              <span className="text-slate-500">Quotation No</span>
              <Link href={quotationHref} className="text-right hover:underline">
                {quotation.quotationNo}
              </Link>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Invoice Status</span>
              <span className="text-right">{invoiceStatusLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-slate-500">Paid Amount</p>
            <p className="text-lg font-semibold">{paidAmountLabel}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-slate-500">Input</p>
            <p className="text-lg font-semibold">{paymentInputLabel}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-slate-500">Quotation Total</p>
            <p className="text-lg font-semibold">{quotationTotalLabel}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-slate-500">Balance</p>
            <p className="text-lg font-semibold">{invoiceBalanceLabel}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-md border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Payment Notes</h2>
          {noteRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-slate-500">
              No payment notes available.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {noteRows.map((item, index) => (
                <div key={`${item.label}-${index}`} className="rounded-md border p-3">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-900">
                    {item.value || "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      <div className="rounded-md border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <span className="text-slate-500">Customer</span>
              <span className="text-right font-medium">{quotation.clientName}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <span className="text-slate-500">Email</span>
              <span className="text-right font-medium">{quotation.clientEmail}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <span className="text-slate-500">Phone</span>
              <span className="text-right font-medium">{lead.phone || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <span className="text-slate-500">Project</span>
              <span className="text-right font-medium">{quotation.projectTitle}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <span className="text-slate-500">Service</span>
              <span className="text-right font-medium">{quotation.serviceName || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <span className="text-slate-500">Payment ID</span>
              <span className="max-w-[260px] break-all text-right font-medium">{payment.id}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <span className="text-slate-500">Paid Amount</span>
              <span className="text-right font-medium">{paidAmountLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <span className="text-slate-500">Quotation Total</span>
              <span className="text-right font-medium">{quotationTotalLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Open Quotation</span>
              <Link href={quotationHref} className="text-right font-medium hover:underline">
                {quotation.quotationNo}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </CrmDetailPageShell>
  );
}
