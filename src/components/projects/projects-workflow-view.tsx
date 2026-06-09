"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProjectMilestoneSprintWorkspace } from "@/components/projects/project-milestone-sprint-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProjectsWorkflowViewProps {
  canManage: boolean;
  projects: Array<{
    id: string;
    name: string;
    code: string;
    startDate?: string | null;
    deadline?: string | null;
    teamMembers: Array<{
      id: string;
      name: string;
      role?: string | null;
    }>;
  }>;
  section: "milestones" | "sprints";
}

const subscribe = () => () => {};

export function ProjectsWorkflowView({
  canManage,
  projects,
  section,
}: ProjectsWorkflowViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isHydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const requestedProjectId = searchParams.get("projectId") ?? "";
  const resolvedProjectId =
    projects.find((project) => project.id === requestedProjectId)?.id ?? projects[0]?.id ?? "";

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === resolvedProjectId) ?? projects[0] ?? null,
    [projects, resolvedProjectId]
  );

  const sectionLabel = section === "milestones" ? "Milestones" : "Sprints";
  const projectWindowLabel = useMemo(() => {
    if (!selectedProject) {
      return "";
    }

    const startLabel = selectedProject.startDate
      ? new Date(selectedProject.startDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "No start";
    const endLabel = selectedProject.deadline
      ? new Date(selectedProject.deadline).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "No deadline";

    return `${startLabel} - ${endLabel}`;
  }, [selectedProject]);

  const handleProjectChange = (projectId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) {
      params.set("projectId", projectId);
    } else {
      params.delete("projectId");
    }
    router.replace(`/projects?${params.toString()}`);
  };

  if (!selectedProject) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-sm text-slate-500">
        No projects are available for {sectionLabel.toLowerCase()} yet.
      </div>
    );
  }

  if (!isHydrated) {
    return (
      <div className="space-y-4">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4">
            <p className="text-sm font-semibold text-slate-900">{sectionLabel}</p>
            <p className="text-sm text-slate-500">Loading {sectionLabel.toLowerCase()} workspace...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-slate-900">{sectionLabel}</p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="font-medium text-slate-900">{selectedProject.code || "PRJ"}</span>
              <span>{selectedProject.teamMembers.length} team members</span>
              <span>{projectWindowLabel}</span>
            </div>
          </div>

          <div className="w-full lg:w-[320px]">
            <Label htmlFor="projects-workflow-project-select">Project</Label>
            <Select value={resolvedProjectId} onValueChange={handleProjectChange}>
              <SelectTrigger id="projects-workflow-project-select" className="mt-2">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name} ({project.code || "PRJ"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <ProjectMilestoneSprintWorkspace
        key={`${section}-${selectedProject.id}`}
        projectId={selectedProject.id}
        section={section}
        canManage={canManage}
        projectStartDate={selectedProject.startDate}
        projectDeadline={selectedProject.deadline}
        teamMembers={selectedProject.teamMembers}
      />
    </div>
  );
}
