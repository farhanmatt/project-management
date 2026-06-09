import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStoredColleges } from "@/actions/client.actions";
import { ClientForm } from "@/components/clients/client-form";

interface NewClientPageProps {
  searchParams?: Promise<{
    name?: string;
    email?: string;
    phone?: string;
  }>;
}

export default async function NewClientPage({ searchParams }: NewClientPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/dashboard");
  }

  const hasClientModuleAccess =
    session.user.role === "ADMIN" ||
    session.user.permissions.moduleAccess.includes("CRM");
  const canCreate =
    session.user.role === "ADMIN" ||
    session.user.permissions.actionPermissions.includes("CREATE");

  if (!hasClientModuleAccess || !canCreate) {
    redirect("/dashboard");
  }
  const colleges = await getStoredColleges();
  const params = (await searchParams) ?? {};

  return (
    <ClientForm
      colleges={colleges}
      draftValues={{
        name: params.name || "",
        email: params.email || "",
        phone: params.phone || "",
      }}
    />
  );
}
