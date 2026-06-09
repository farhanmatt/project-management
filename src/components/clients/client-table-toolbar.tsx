"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Plus,
  Search,
  Settings,
  Upload,
} from "lucide-react";
import type { ClientStatusFilter } from "@/actions/client.actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

interface ClientTableToolbarProps {
  canCreate: boolean;
  isPending: boolean;
  onExport: () => void;
  onOpenImport: () => void;
  onPageChange: (nextPage: number) => void;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStatusChange: (nextStatus: ClientStatusFilter) => void;
  page: number;
  pages: number;
  search: string;
  status: ClientStatusFilter;
}

export function ClientTableToolbar({
  canCreate,
  isPending,
  onExport,
  onOpenImport,
  onPageChange,
  onSearchChange,
  onSearchSubmit,
  onStatusChange,
  page,
  pages,
  search,
  status,
}: ClientTableToolbarProps) {
  return (
    <div className="shrink-0 border-b border-slate-200 px-4 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {canCreate ? (
            <Button asChild className="bg-[#7c4a69] hover:bg-[#6d425d]">
              <Link href="/clients/new">
                <Plus className="mr-2 h-4 w-4" />
                New
              </Link>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="h-10 w-10">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {canCreate ? (
                <DropdownMenuItem onClick={onOpenImport}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import records
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={onExport}>
                <Download className="mr-2 h-4 w-4" />
                Export records
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="text-xl font-semibold text-slate-800">Contacts</div>
        </div>
        <form onSubmit={onSearchSubmit} className="flex w-full max-w-xl min-w-0">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search..."
              className="h-10 rounded-r-none border-slate-300 pl-9 focus-visible:ring-[#31a6c2]"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 rounded-l-none border-l-0">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 text-sm text-slate-600">
            {pages === 0 ? "0-0 / 0" : `${page}-${pages} / ${pages}`}
          </div>
          <Button
            variant="outline"
            size="icon"
            disabled={page <= 1 || isPending}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= pages || isPending}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={status !== "all" ? "bg-sky-50" : ""}
                title="Filter contacts"
              >
                <Filter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                checked={status === "all"}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onStatusChange("all");
                  }
                }}
              >
                All contacts
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={status === "active"}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onStatusChange("active");
                  }
                }}
              >
                Active contacts
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={status === "inactive"}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onStatusChange("inactive");
                  }
                }}
              >
                Inactive contacts
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

