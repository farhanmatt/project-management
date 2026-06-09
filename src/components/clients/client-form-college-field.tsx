import { ChevronDown, Mail, Plus } from "lucide-react";
import type { StoredCollegeEntry } from "@/actions/client.actions";
import { Input } from "@/components/ui/input";

interface ClientFormCollegeFieldProps {
  canCreateCollege: boolean;
  collegeName: string;
  disabled: boolean;
  filteredColleges: StoredCollegeEntry[];
  onBlur: () => void;
  onChange: (value: string) => void;
  onCreateCollege: () => void;
  onFocus: () => void;
  onSelectCollege: (name: string) => void;
  showCollegeDropdown: boolean;
  storedColleges: StoredCollegeEntry[];
}

export function ClientFormCollegeField({
  canCreateCollege,
  collegeName,
  disabled,
  filteredColleges,
  onBlur,
  onChange,
  onCreateCollege,
  onFocus,
  onSelectCollege,
  showCollegeDropdown,
  storedColleges,
}: ClientFormCollegeFieldProps) {
  return (
    <div className="flex items-center gap-2 text-slate-500">
      <Mail className="h-5 w-5 text-[#7c4a69]" />
      <div className="relative w-full max-w-[24rem]">
        <Input
          id="collegeName"
          name="collegeName"
          value={collegeName}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="College Name"
          disabled={disabled}
          autoComplete="off"
          className="h-8 border-0 px-0 pr-8 text-2xl shadow-none focus-visible:ring-0"
        />
        {storedColleges.length > 0 ? (
          <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        ) : null}
        {showCollegeDropdown ? (
          <div className="absolute left-0 top-full z-20 mt-2 min-w-[260px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)]">
            {filteredColleges.map((storedCollege) => (
              <button
                key={storedCollege.id}
                type="button"
                className="block w-full px-4 py-2 text-left text-base font-medium text-slate-900 hover:bg-slate-50"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelectCollege(storedCollege.name);
                }}
              >
                {storedCollege.name}
              </button>
            ))}
            {canCreateCollege ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2 text-left text-sm font-medium text-[#7c4a69] hover:bg-slate-50"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onCreateCollege();
                }}
              >
                <Plus className="h-4 w-4" />
                Create &quot;{collegeName.trim()}&quot;
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

