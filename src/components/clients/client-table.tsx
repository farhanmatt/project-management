"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Clock3,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserX,
  UserCheck,
} from "lucide-react";
import {
  deleteClient,
  exportClientsCsv,
  toggleClientStatus,
  type ClientListItem,
  type ClientStatusFilter,
} from "@/actions/client.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientImportDialog } from "./client-import-dialog";
import { ClientDeleteDialog } from "./client-delete-dialog";
import { ClientTableToolbar } from "./client-table-toolbar";

interface ClientTableProps {
  clients: ClientListItem[];
  page: number;
  pages: number;
  query: string;
  status: ClientStatusFilter;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}

export function ClientTable({
  clients,
  page,
  pages,
  query,
  status,
  canCreate = false,
  canUpdate = false,
  canDelete = false,
}: ClientTableProps) {
  const [isPending, startTransition] = useTransition();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [search, setSearch] = useState(query);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const displayedClients = clients;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    setSearch(query);
  }, [query]);

  useEffect(() => {
    const visibleIds = new Set(displayedClients.map((client) => client.id));
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [displayedClients]);

  const allSelected = useMemo(
    () => displayedClients.length > 0 && displayedClients.every((client) => selectedIdSet.has(client.id)),
    [displayedClients, selectedIdSet]
  );
  const stickyHeaderCellClassName = "sticky top-0 z-10 bg-slate-50";

  const updateParams = ({
    nextQuery = query,
    nextPage = page,
    nextStatus = status,
  }: {
    nextQuery?: string;
    nextPage?: number;
    nextStatus?: ClientStatusFilter;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextQuery) {
      params.set("q", nextQuery);
    } else {
      params.delete("q");
    }

    if (nextPage > 1) {
      params.set("page", String(nextPage));
    } else {
      params.delete("page");
    }

    if (nextStatus !== "all") {
      params.set("status", nextStatus);
    } else {
      params.delete("status");
    }

    const url = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.push(url);
  };

  const toErrorMessage = (error: unknown) => {
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
      return Object.values(error as Record<string, string[] | undefined>)
        .flat()
        .filter(Boolean)
        .join(", ");
    }
    return "Something went wrong";
  };

  const onSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParams({ nextQuery: search.trim(), nextPage: 1 });
  };

  const handleDelete = () => {
    if (!deleteId) return;

    startTransition(async () => {
      const result = await deleteClient(deleteId);
      if (result.error) {
        toast.error(toErrorMessage(result.error));
      } else {
        toast.success("Client deleted successfully");
        router.refresh();
      }
      setDeleteId(null);
    });
  };

  const handleToggleStatus = (id: string) => {
    startTransition(async () => {
      const result = await toggleClientStatus(id);
      if (result.error) {
        toast.error(toErrorMessage(result.error));
      } else {
        const isActive = "data" in result ? result.data?.isActive : undefined;
        toast.success(`Client ${isActive ? "activated" : "deactivated"} successfully`);
        router.refresh();
      }
    });
  };

  const handleExport = () => {
    startTransition(async () => {
      try {
        const csv = await exportClientsCsv({ query, status });
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "contacts-export.csv";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        toast.success("Contacts exported successfully");
      } catch {
        toast.error("Unable to export contacts");
      }
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(displayedClients.map((item) => item.id));
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)]">
        <ClientTableToolbar
          canCreate={canCreate}
          isPending={isPending}
          onExport={handleExport}
          onOpenImport={() => setIsImportDialogOpen(true)}
          onPageChange={(nextPage) => updateParams({ nextPage })}
          onSearchChange={setSearch}
          onSearchSubmit={onSearchSubmit}
          onStatusChange={(nextStatus) => updateParams({ nextStatus, nextPage: 1 })}
          page={page}
          pages={pages}
          search={search}
          status={status}
        />

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50/95 backdrop-blur">
              <tr className="border-b bg-slate-50 text-left">
                <th className={`${stickyHeaderCellClassName} w-12 px-4 py-3`}>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                </th>
                <th className={`${stickyHeaderCellClassName} px-4 py-3 font-semibold`}>Student Name</th>
                <th className={`${stickyHeaderCellClassName} px-4 py-3 font-semibold`}>Email</th>
                <th className={`${stickyHeaderCellClassName} px-4 py-3 font-semibold`}>Phone</th>
                <th className={`${stickyHeaderCellClassName} px-4 py-3 font-semibold`}>Activities</th>
                <th className={`${stickyHeaderCellClassName} px-4 py-3 font-semibold`}>Country</th>
                <th className={`${stickyHeaderCellClassName} w-16 px-4 py-3`}></th>
              </tr>
            </thead>
            <tbody>
              {displayedClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No contacts found.
                  </td>
                </tr>
              ) : (
                displayedClients.map((client) => (
                  <tr
                    key={client.id}
                    className="h-16 border-b hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIdSet.has(client.id)}
                        onChange={() => toggleSelectOne(client.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <Link href={`/clients/${client.id}`} className="hover:underline">
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{client.email}</td>
                    <td className="px-4 py-3">{client.phone || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center gap-1 text-slate-600">
                        <Clock3 className="h-4 w-4" />
                        <span>{client.activityCount}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{client.country || "-"}</td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={isPending}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/clients/${client.id}`}>View</Link>
                          </DropdownMenuItem>
                          {canUpdate && (
                            <DropdownMenuItem asChild>
                              <Link href={`/clients/${client.id}/edit`}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {canUpdate && (
                            <DropdownMenuItem onClick={() => handleToggleStatus(client.id)}>
                              {client.isActive ? (
                                <>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteId(client.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ClientImportDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} />

      <ClientDeleteDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteId(null);
          }
        }}
        onConfirm={handleDelete}
      />
    </>
  );
}
