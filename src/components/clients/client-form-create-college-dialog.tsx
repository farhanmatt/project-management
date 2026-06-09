import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ClientFormCreateCollegeDialogProps {
  address: string;
  name: string;
  onAddressChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  pending: boolean;
}

export function ClientFormCreateCollegeDialog({
  address,
  name,
  onAddressChange,
  onNameChange,
  onOpenChange,
  onSubmit,
  open,
  pending,
}: ClientFormCreateCollegeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create College</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newCollegeName">College Name</Label>
            <Input
              id="newCollegeName"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Enter college name"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newCollegeAddress">Address</Label>
            <Textarea
              id="newCollegeAddress"
              value={address}
              onChange={(event) => onAddressChange(event.target.value)}
              placeholder="Enter college address"
              rows={4}
              disabled={pending}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
