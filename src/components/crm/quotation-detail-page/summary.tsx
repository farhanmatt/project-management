import { getProjectCategoryFromTags, getVisibleProjectTags, createInrFormatter } from "./helpers";
import type { CrmQuotationDetailItem, CrmQuotationDetailQuotation } from "./types";

interface CrmQuotationDetailSummaryProps {
  items: CrmQuotationDetailItem[];
  quotation: CrmQuotationDetailQuotation;
}

export function CrmQuotationDetailSummary({
  items,
  quotation,
}: CrmQuotationDetailSummaryProps) {
  const currency = createInrFormatter();
  const formatAmount = (value: number | null | undefined) => currency.format(Number(value ?? 0));
  const projectCategories = Array.from(
    new Set(
      items
        .map((item) => getProjectCategoryFromTags(item.tags))
        .filter((value): value is string => Boolean(value))
    )
  );

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Client</p>
          <p className="font-medium">{quotation.clientName}</p>
          <p className="text-sm text-slate-600">{quotation.clientEmail}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Status</p>
          <p className="font-medium">{quotation.status}</p>
          <p className="text-sm text-slate-600">
            {quotation.sentAt ? `Sent on ${new Date(quotation.sentAt).toLocaleString()}` : "Not sent yet"}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Service</p>
          <p className="font-medium">{quotation.serviceName || "-"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Project Category</p>
          <p className="font-medium">{projectCategories.length > 0 ? projectCategories.join(", ") : "-"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Validity</p>
          <p className="font-medium">
            {quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString() : "-"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-slate-500">Subtotal</p>
          <p className="text-lg font-semibold">{formatAmount(quotation.subtotalAmount)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-slate-500">GST</p>
          <p className="text-lg font-semibold">{formatAmount(quotation.gstAmount)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-slate-500">Total</p>
          <p className="text-lg font-semibold">{formatAmount(quotation.totalAmount)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs text-slate-500">Terms</p>
          <p className="whitespace-pre-wrap text-sm">{quotation.terms || "-"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Notes</p>
          <p className="whitespace-pre-wrap text-sm">{quotation.notes || "-"}</p>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-md border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Project Details</h2>
              <p className="text-xs text-slate-500">Selected project rows with category and pricing.</p>
            </div>
            <span className="text-sm text-slate-500">{items.length} item(s)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">GST %</th>
                  <th className="px-3 py-2">Tags</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                    <td className="px-3 py-2">{getProjectCategoryFromTags(item.tags) || "-"}</td>
                    <td className="px-3 py-2 text-right">{item.unitCount}</td>
                    <td className="px-3 py-2 text-right">{formatAmount(item.amount)}</td>
                    <td className="px-3 py-2 text-right">{Number(item.gstPercent || 0).toFixed(2)}%</td>
                    <td className="px-3 py-2">{getVisibleProjectTags(item.tags)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

