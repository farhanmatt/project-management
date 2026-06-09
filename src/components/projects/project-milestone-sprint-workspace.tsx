"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { addDays, format, isAfter, isBefore, isValid, parseISO } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Clock3,
  Copy,
  FilterX,
  GripVertical,
  MoreHorizontal,
  PenSquare,
  Plus,
  RefreshCcw,
  Search,
  Target,
  Trash2,
} from "lucide-react";
import { getProjectWorkflowState, saveProjectMilestones, saveProjectSprints } from "@/actions/project-workflow.actions";
import { createProjectTask } from "@/actions/project-task.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getTaskPriorityLabel,
  getTaskPriorityLevel,
  type ProjectTask,
} from "@/lib/project-task-utils";
import type {
  MilestoneStatus,
  ProjectMilestone,
  ProjectSprint,
  SprintStageKey,
  SprintStatus,
} from "@/lib/project-workflow-types";
import {
  MILESTONE_STATUS_OPTIONS,
  SPRINT_STAGE_OPTIONS,
  SPRINT_STATUS_OPTIONS,
  findSprintForTask,
  getDerivedMilestoneStatus,
  getMilestoneCompletionPercent,
  getMilestoneCompletedSprintCount,
  getMilestonePendingSprintCount,
  getMilestoneSprintCount,
  getMilestoneStatusLabel,
  getMilestoneTaskCount,
  getProjectWorkflowCompletionPercent,
  getSprintCompletedTaskCount,
  getSprintDeadlineLabel,
  getSprintPendingTaskCount,
  getSprintProgressPercent,
  getSprintTaskBuckets,
  getTaskMilestoneId,
  getTaskSprintStage,
  isMilestoneDelayed,
  isMilestoneUpcoming,
  isSprintOverdue,
  isSprintWithinMilestoneWindow,
  isTaskWithinSprintWindow,
  sortMilestonesByDate,
  sortSprintsByDate,
} from "@/lib/project-workflow-utils";

type SectionKey = "milestones" | "sprints";

interface ProjectMilestoneSprintWorkspaceProps {
  projectId: string;
  section: SectionKey;
  canManage: boolean;
  projectStartDate?: string | null;
  projectDeadline?: string | null;
  teamMembers?: Array<{
    id: string;
    name: string;
    role?: string | null;
  }>;
}

interface MilestoneTaskDraftState {
  included: boolean;
  required: boolean;
}

interface SprintTaskFilters {
  assignee: string;
  status: "all" | SprintStageKey;
  milestone: string;
  deadline: "all" | "overdue" | "dueSoon" | "noDueDate";
}

type MilestoneDraftState = ReturnType<typeof makeMilestoneDraft>;

function toWorkflowDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function formatWorkflowDateInput(value?: string | null) {
  const parsed = toWorkflowDate(value);
  return parsed ? format(parsed, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
}

function makeMilestoneDraft() {
  return {
    title: "",
    description: "",
    startDate: "",
    targetDate: "",
    status: "NOT_STARTED" as MilestoneStatus,
    ownerId: "unassigned",
  };
}

function makeSprintDraft(milestone?: Pick<ProjectMilestone, "startDate" | "targetDate" | "id"> | null) {
  return {
    name: "",
    goal: "",
    milestoneId: milestone?.id ?? "",
    startDate: "",
    endDate: "",
    status: "PLANNED" as SprintStatus,
    ownerId: "unassigned",
    ownerName: "",
    teamMemberIds: [] as string[],
  };
}

function makeSprintTaskDraft() {
  const now = new Date();
  return {
    title: "",
    description: "",
    assigneeId: "unassigned",
    priority: "1",
    dueDate: format(addDays(now, 3), "yyyy-MM-dd"),
  };
}

function makeMilestoneDraftFromMilestone(milestone: ProjectMilestone): MilestoneDraftState {
  return {
    title: milestone.title,
    description: milestone.description,
    startDate: formatWorkflowDateInput(milestone.startDate),
    targetDate: formatWorkflowDateInput(milestone.targetDate),
    status: milestone.status,
    ownerId: milestone.ownerId ?? "unassigned",
  };
}

function getTaskTitle(task: ProjectTask) {
  return task.title.trim() || "Untitled task";
}

function getTaskDueLabel(task: ProjectTask) {
  if (!task.dueDate) return "No due date";
  const parsed = new Date(task.dueDate);
  return Number.isNaN(parsed.getTime()) ? "No due date" : format(parsed, "dd MMM yyyy");
}

export function ProjectMilestoneSprintWorkspace({
  projectId,
  section,
  canManage,
  projectStartDate,
  projectDeadline,
  teamMembers = [],
}: ProjectMilestoneSprintWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [sprints, setSprints] = useState<ProjectSprint[]>([]);

  const [milestoneSearch, setMilestoneSearch] = useState("");
  const [milestoneStatusFilter, setMilestoneStatusFilter] = useState<MilestoneStatus | "all">("all");
  const [milestoneDateFilter, setMilestoneDateFilter] = useState<"all" | "upcoming" | "overdue" | "reached">("all");
  const [milestoneDraft, setMilestoneDraft] = useState(() => makeMilestoneDraft());
  const [milestoneEditorDraft, setMilestoneEditorDraft] = useState<MilestoneDraftState>(() => makeMilestoneDraft());
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [milestoneDialogId, setMilestoneDialogId] = useState<string | null>(null);
  const [milestoneEditorOpen, setMilestoneEditorOpen] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneTaskDraft, setMilestoneTaskDraft] = useState<Record<string, MilestoneTaskDraftState>>({});
  const [isSavingMilestones, setIsSavingMilestones] = useState(false);
  const [createMilestoneDialogOpen, setCreateMilestoneDialogOpen] = useState(false);
  const [createSprintDialogOpen, setCreateSprintDialogOpen] = useState(false);
  const focusTarget = searchParams.get("focus");

  const [sprintDraft, setSprintDraft] = useState(() => makeSprintDraft());
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [sprintListSearch, setSprintListSearch] = useState("");
  const [sprintListStatusFilter, setSprintListStatusFilter] = useState<SprintStatus | "all">("all");
  const [sprintListMilestoneFilter, setSprintListMilestoneFilter] = useState("all");
  const [sprintTaskSearch, setSprintTaskSearch] = useState("");
  const [sprintFilters, setSprintFilters] = useState<SprintTaskFilters>({
    assignee: "all",
    status: "all",
    milestone: "all",
    deadline: "all",
  });
  const [isSavingSprints, setIsSavingSprints] = useState(false);
  const [draggedSprintTaskId, setDraggedSprintTaskId] = useState<string | null>(null);
  const [dragOverSprintStage, setDragOverSprintStage] = useState<SprintStageKey | null>(null);
  const [sprintTaskDraft, setSprintTaskDraft] = useState(makeSprintTaskDraft);
  const [isCreatingSprintTask, setIsCreatingSprintTask] = useState(false);

  useEffect(() => {
    let alive = true;

    getProjectWorkflowState(projectId).then((result) => {
      if (!alive) return;
      if (result.error) {
        toast.error(result.error);
      }
      setTasks(result.tasks ?? []);
      setMilestones(result.milestones ?? []);
      setSprints(result.sprints ?? []);
      setSelectedSprintId((current) => current ?? result.sprints?.find((sprint) => sprint.status === "ACTIVE")?.id ?? result.sprints?.[0]?.id ?? null);
      setIsLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [projectId]);

  const isCreateMilestoneFocusActive =
    canManage && section === "milestones" && focusTarget === "createMilestone";
  const isCreateMilestonePanelOpen =
    canManage && (createMilestoneDialogOpen || isCreateMilestoneFocusActive);
  const isCreateSprintFocusActive =
    canManage && section === "sprints" && focusTarget === "createSprint";
  const isCreateSprintPanelOpen =
    canManage && (createSprintDialogOpen || isCreateSprintFocusActive);

  const clearFocusQueryParam = () => {
    if (!focusTarget) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `/projects?${nextQuery}` : "/projects");
  };

  const handleCreateMilestoneDialogOpenChange = (open: boolean) => {
    if (open) {
      setMilestoneDraft(makeMilestoneDraft());
    }
    setCreateMilestoneDialogOpen(open);

    if (!open && isCreateMilestoneFocusActive) {
      clearFocusQueryParam();
    }
  };

  const handleCreateSprintDialogOpenChange = (open: boolean) => {
    if (open) {
      setSprintDraft(makeSprintDraft());
    }
    setCreateSprintDialogOpen(open);

    if (!open && isCreateSprintFocusActive) {
      clearFocusQueryParam();
    }
  };

  const refreshState = () => {
    setIsLoading(true);
    getProjectWorkflowState(projectId).then((result) => {
      setTasks(result.tasks ?? []);
      setMilestones(result.milestones ?? []);
      setSprints(result.sprints ?? []);
      setSelectedSprintId((current) => current ?? result.sprints?.find((sprint) => sprint.status === "ACTIVE")?.id ?? result.sprints?.[0]?.id ?? null);
      setIsLoading(false);
    });
  };

  const persistMilestones = (nextMilestones: ProjectMilestone[]) => {
    setIsSavingMilestones(true);
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("milestones", JSON.stringify(nextMilestones));

    startTransition(async () => {
      const result = await saveProjectMilestones(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setMilestones(result.milestones ?? nextMilestones);
        toast.success("Milestones updated");
      }
      setIsSavingMilestones(false);
    });
  };

  const persistSprints = (nextSprints: ProjectSprint[]) => {
    setIsSavingSprints(true);
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("sprints", JSON.stringify(nextSprints));

    startTransition(async () => {
      const result = await saveProjectSprints(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setSprints(result.sprints ?? nextSprints);
        toast.success("Sprints updated");
      }
      setIsSavingSprints(false);
    });
  };

  const assignedTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const sprint of sprints) {
      for (const assignment of sprint.taskAssignments) {
        ids.add(assignment.taskId);
      }
    }
    return ids;
  }, [sprints]);

  const teamMemberMap = useMemo(
    () => new Map(teamMembers.map((member) => [member.id, member])),
    [teamMembers]
  );
  const getMemberName = (memberId?: string | null) => {
    if (!memberId) {
      return "Unassigned";
    }

    return teamMemberMap.get(memberId)?.name ?? memberId;
  };
  const getTaskAssigneeDisplay = (task: ProjectTask) =>
    getMemberName(task.employeeAssigneeId?.trim() || task.assigneeId?.trim() || "");
  const projectWindow = useMemo(
    () => ({
      start: toWorkflowDate(projectStartDate),
      end: toWorkflowDate(projectDeadline),
    }),
    [projectDeadline, projectStartDate]
  );
  const backlogTasks = useMemo(
    () =>
      tasks
        .filter((task) => !assignedTaskIds.has(task.id))
        .slice()
        .sort((left, right) => {
          const priorityDiff = getTaskPriorityLevel(right) - getTaskPriorityLevel(left);
          if (priorityDiff !== 0) {
            return priorityDiff;
          }

          const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          return leftDue - rightDue || getTaskTitle(left).localeCompare(getTaskTitle(right));
        }),
    [assignedTaskIds, tasks]
  );

  const linkedMilestoneMap = useMemo(() => {
    const map = new Map<string, ProjectMilestone>();
    for (const milestone of milestones) {
      for (const link of milestone.taskLinks) {
        map.set(link.taskId, milestone);
      }
    }
    for (const sprint of sprints) {
      const milestone = milestones.find((item) => item.id === sprint.milestoneId);
      if (!milestone) continue;
      for (const assignment of sprint.taskAssignments) {
        if (!map.has(assignment.taskId)) {
          map.set(assignment.taskId, milestone);
        }
      }
    }
    return map;
  }, [milestones, sprints]);
  const hasMilestoneFiltersActive =
    milestoneSearch.trim().length > 0 ||
    milestoneStatusFilter !== "all" ||
    milestoneDateFilter !== "all";

  const milestoneSummary = useMemo(() => {
    const total = milestones.length;
    const reached = milestones.filter((milestone) => getDerivedMilestoneStatus(milestone, tasks, sprints) === "REACHED").length;
    const delayed = milestones.filter((milestone) => isMilestoneDelayed(milestone, tasks, sprints)).length;
    const upcoming = milestones.filter((milestone) => isMilestoneUpcoming(milestone)).length;
    const progress = getProjectWorkflowCompletionPercent(milestones, sprints, tasks);
    return { total, reached, delayed, upcoming, progress };
  }, [milestones, sprints, tasks]);

  const milestoneCards = useMemo(() => {
    const search = milestoneSearch.trim().toLowerCase();
    return sortMilestonesByDate(milestones).filter((milestone) => {
      const status = getDerivedMilestoneStatus(milestone, tasks, sprints);
      const sprintCount = getMilestoneSprintCount(milestone, sprints);
      const matchesSearch =
        !search ||
        milestone.title.toLowerCase().includes(search) ||
        milestone.description.toLowerCase().includes(search) ||
        (milestone.ownerName ?? "").toLowerCase().includes(search) ||
        String(sprintCount).includes(search) ||
        status.toLowerCase().includes(search);
      const matchesStatus = milestoneStatusFilter === "all" || status === milestoneStatusFilter;
      const matchesDate =
        milestoneDateFilter === "all" ||
        (milestoneDateFilter === "upcoming" && isMilestoneUpcoming(milestone)) ||
        (milestoneDateFilter === "overdue" && isMilestoneDelayed(milestone, tasks, sprints)) ||
        (milestoneDateFilter === "reached" && status === "REACHED");
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [milestoneDateFilter, milestoneSearch, milestoneStatusFilter, milestones, sprints, tasks]);

  const selectedSprint = useMemo(() => {
    const explicitSelection = selectedSprintId
      ? sprints.find((sprint) => sprint.id === selectedSprintId) ?? null
      : null;
    return explicitSelection ?? sprints.find((sprint) => sprint.status === "ACTIVE") ?? sprints[0] ?? null;
  }, [selectedSprintId, sprints]);
  const selectedSprintMilestone = useMemo(
    () => (selectedSprint ? milestones.find((milestone) => milestone.id === selectedSprint.milestoneId) ?? null : null),
    [milestones, selectedSprint]
  );
  const selectedSprintTeamMembers = useMemo(
    () =>
      selectedSprint
        ? selectedSprint.teamMemberIds.flatMap((memberId) => {
            const member = teamMemberMap.get(memberId);
            return member ? [member] : [];
          })
        : [],
    [selectedSprint, teamMemberMap]
  );

  const selectedSprintTasks = useMemo(() => {
    if (!selectedSprint) {
      return [];
    }

    const search = sprintTaskSearch.trim().toLowerCase();

    return selectedSprint.taskAssignments
      .map((assignment) => {
        const task = tasks.find((item) => item.id === assignment.taskId);
        return task ? { task, stage: assignment.stage } : null;
      })
      .filter((item): item is { task: ProjectTask; stage: SprintStageKey } => Boolean(item))
      .filter(({ task, stage }) => {
        const assigneeId = task.employeeAssigneeId?.trim() || task.assigneeId?.trim() || "";
        const assigneeName = teamMemberMap.get(assigneeId)?.name ?? assigneeId;
        const resolvedAssigneeName = assigneeName || "Unassigned";
        const assignee = resolvedAssigneeName.toLowerCase();
        const milestone = milestones.find((item) => item.id === getTaskMilestoneId(task.id, milestones, sprints)) ?? linkedMilestoneMap.get(task.id);
        const dueDate = task.dueDate ? new Date(task.dueDate) : null;
        const matchesSearch =
          !search ||
          task.title.toLowerCase().includes(search) ||
          assignee.includes(search) ||
          milestone?.title.toLowerCase().includes(search);
        const matchesAssignee =
          sprintFilters.assignee === "all" ||
          resolvedAssigneeName === sprintFilters.assignee;
        const matchesStatus = sprintFilters.status === "all" || stage === sprintFilters.status;
        const matchesMilestone = sprintFilters.milestone === "all" || milestone?.id === sprintFilters.milestone;
        const matchesDeadline =
          sprintFilters.deadline === "all" ||
          (sprintFilters.deadline === "overdue" &&
            dueDate != null &&
            isBefore(dueDate, new Date()) &&
            stage !== "DONE") ||
          (sprintFilters.deadline === "dueSoon" &&
            dueDate != null &&
            isAfter(dueDate, new Date()) &&
            isBefore(dueDate, addDays(new Date(), 7))) ||
          (sprintFilters.deadline === "noDueDate" && dueDate == null);

        return matchesSearch && matchesAssignee && matchesStatus && matchesMilestone && matchesDeadline;
      });
  }, [linkedMilestoneMap, milestones, selectedSprint, sprintFilters, sprintTaskSearch, sprints, tasks, teamMemberMap]);

  const selectedSprintTaskBuckets = useMemo(() => {
    if (!selectedSprint) {
      return SPRINT_STAGE_OPTIONS.reduce<Record<SprintStageKey, ProjectTask[]>>((acc, option) => {
        acc[option.value] = [];
        return acc;
      }, {} as Record<SprintStageKey, ProjectTask[]>);
    }

    const buckets = getSprintTaskBuckets(selectedSprint, tasks);
    for (const stage of Object.keys(buckets) as SprintStageKey[]) {
      buckets[stage] = buckets[stage].filter((task) => selectedSprintTasks.some((item) => item.task.id === task.id));
    }
    return buckets;
  }, [selectedSprint, selectedSprintTasks, tasks]);

  const activeSprintCount = useMemo(() => sprints.filter((sprint) => sprint.status === "ACTIVE").length, [sprints]);

  const selectedSprintSummary = useMemo(() => {
    if (!selectedSprint) {
      return { total: 0, completed: 0, pending: 0, overdue: 0, progress: 0 };
    }

    const total = selectedSprint.taskAssignments.length;
    const completed = getSprintCompletedTaskCount(selectedSprint, tasks);
    const pending = getSprintPendingTaskCount(selectedSprint, tasks);
    const overdue = selectedSprint.taskAssignments.filter((assignment) => {
      const task = tasks.find((item) => item.id === assignment.taskId);
      if (!task?.dueDate || assignment.stage === "DONE") {
        return false;
      }
      const dueDate = new Date(task.dueDate);
      return !Number.isNaN(dueDate.getTime()) && isBefore(dueDate, new Date());
    }).length;

    return {
      total,
      completed,
      pending,
      overdue,
      progress: getSprintProgressPercent(selectedSprint, tasks),
    };
  }, [selectedSprint, tasks]);
  const hasSprintListFiltersActive =
    sprintListSearch.trim().length > 0 ||
    sprintListStatusFilter !== "all" ||
    sprintListMilestoneFilter !== "all";
  const sprintListItems = useMemo(() => {
    const search = sprintListSearch.trim().toLowerCase();

    return sortSprintsByDate(sprints).filter((sprint) => {
      const milestoneTitle =
        milestones.find((item) => item.id === sprint.milestoneId)?.title.toLowerCase() ?? "";
      const matchesStatus =
        sprintListStatusFilter === "all" || sprint.status === sprintListStatusFilter;
      const matchesMilestone =
        sprintListMilestoneFilter === "all" || sprint.milestoneId === sprintListMilestoneFilter;

      return (
        matchesStatus &&
        matchesMilestone &&
        (
          !search ||
          sprint.name.toLowerCase().includes(search) ||
          sprint.goal.toLowerCase().includes(search) ||
          sprint.ownerName.toLowerCase().includes(search) ||
          milestoneTitle.includes(search)
        )
      );
    });
  }, [milestones, sprintListMilestoneFilter, sprintListSearch, sprintListStatusFilter, sprints]);
  const sprintMilestoneOptions = sortMilestonesByDate(milestones).map((milestone) => ({
    id: milestone.id,
    title: milestone.title,
  }));
  const selectedSprintDraftMilestone =
    milestones.find((milestone) => milestone.id === sprintDraft.milestoneId) ?? null;

  const resetSprintListFilters = () => {
    setSprintListSearch("");
    setSprintListStatusFilter("all");
    setSprintListMilestoneFilter("all");
  };

  const getBacklogAssignmentError = (task: ProjectTask, sprint: ProjectSprint | null) => {
    if (!sprint) {
      return "Select a sprint first";
    }

    if (!task.dueDate || !isTaskWithinSprintWindow(task, sprint)) {
      return "Task due date must stay inside the sprint window";
    }

    const taskAssigneeId = task.employeeAssigneeId || task.assigneeId;
    if (taskAssigneeId && sprint.teamMemberIds.length > 0 && !sprint.teamMemberIds.includes(taskAssigneeId)) {
      return "Task assignee must be part of the sprint team";
    }

    const linkedMilestoneId = getTaskMilestoneId(task.id, milestones, sprints);
    if (linkedMilestoneId && linkedMilestoneId !== sprint.milestoneId) {
      return "Task milestone must match the sprint milestone";
    }

    const existingSprint = findSprintForTask(task.id, sprints);
    if (existingSprint && existingSprint.id !== sprint.id) {
      return "Task already belongs to another sprint";
    }

    return null;
  };

  const saveMilestoneLinks = () => {
    if (!milestoneDialogId) return;
    const nextMilestones = milestones.map((milestone) =>
      milestone.id === milestoneDialogId
        ? {
            ...milestone,
            taskLinks: Object.entries(milestoneTaskDraft)
              .filter(([, state]) => state.included)
              .map(([taskId, state]) => ({ taskId, required: state.required })),
            updatedAt: new Date().toISOString(),
          }
        : milestone
    );
    setMilestoneDialogOpen(false);
    setMilestoneDialogId(null);
    setMilestoneTaskDraft({});
    persistMilestones(nextMilestones);
  };

  const openMilestoneDialog = (milestone: ProjectMilestone) => {
    const draft: Record<string, MilestoneTaskDraftState> = {};
    for (const task of tasks) {
      const link = milestone.taskLinks.find((item) => item.taskId === task.id);
      draft[task.id] = {
        included: Boolean(link),
        required: link?.required ?? false,
      };
    }
    setMilestoneDialogId(milestone.id);
    setMilestoneTaskDraft(draft);
    setMilestoneDialogOpen(true);
  };

  const resolveMilestoneDraftPayload = (draft: MilestoneDraftState) => {
    if (!draft.title.trim()) {
      toast.error("Milestone title is required");
      return null;
    }

    const startDate = new Date(draft.startDate);
    const targetDate = new Date(draft.targetDate);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(targetDate.getTime()) ||
      isAfter(startDate, targetDate)
    ) {
      toast.error("Milestone dates are invalid");
      return null;
    }

    if (
      projectWindow.start &&
      !Number.isNaN(projectWindow.start.getTime()) &&
      isBefore(startDate, projectWindow.start)
    ) {
      toast.error("Milestone cannot start before the project");
      return null;
    }

    if (
      projectWindow.end &&
      !Number.isNaN(projectWindow.end.getTime()) &&
      isAfter(targetDate, projectWindow.end)
    ) {
      toast.error("Milestone must stay inside the project deadline");
      return null;
    }

    const owner =
      draft.ownerId !== "unassigned" ? teamMemberMap.get(draft.ownerId) ?? null : null;

    return {
      title: draft.title.trim(),
      description: draft.description.trim(),
      startDate: startDate.toISOString(),
      targetDate: targetDate.toISOString(),
      status: draft.status,
      owner,
    };
  };

  const openMilestoneEditor = (milestone: ProjectMilestone) => {
    setEditingMilestoneId(milestone.id);
    setMilestoneEditorDraft(makeMilestoneDraftFromMilestone(milestone));
    setMilestoneEditorOpen(true);
  };

  const handleUpdateMilestone = () => {
    if (!editingMilestoneId) {
      return;
    }

    const payload = resolveMilestoneDraftPayload(milestoneEditorDraft);
    if (!payload) {
      return;
    }

    const nextMilestones = milestones.map((milestone) =>
      milestone.id === editingMilestoneId
        ? {
            ...milestone,
            title: payload.title,
            description: payload.description,
            startDate: payload.startDate,
            targetDate: payload.targetDate,
            status: payload.status,
            ownerId: payload.owner?.id,
            ownerName: payload.owner?.name,
            updatedAt: new Date().toISOString(),
          }
        : milestone
    );

    setMilestoneEditorOpen(false);
    setEditingMilestoneId(null);
    persistMilestones(nextMilestones);
  };

  const handleDuplicateMilestone = (milestone: ProjectMilestone) => {
    const now = new Date().toISOString();
    const duplicate: ProjectMilestone = {
      ...milestone,
      id: crypto.randomUUID(),
      title: `${milestone.title} Copy`,
      status: "NOT_STARTED",
      taskLinks: [],
      createdAt: now,
      updatedAt: now,
    };

    persistMilestones([duplicate, ...milestones]);
    toast.success("Milestone duplicated");
  };

  const handleDeleteMilestone = (milestone: ProjectMilestone) => {
    if (getMilestoneSprintCount(milestone, sprints) > 0) {
      toast.error("Delete the related sprints first");
      return;
    }

    persistMilestones(milestones.filter((item) => item.id !== milestone.id));
  };

  const resetMilestoneFilters = () => {
    setMilestoneSearch("");
    setMilestoneStatusFilter("all");
    setMilestoneDateFilter("all");
  };

  const renderMilestoneActions = (milestone: ProjectMilestone) => {
    if (!canManage) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openMilestoneEditor(milestone)}>
            <PenSquare className="mr-2 h-4 w-4" />
            Edit milestone
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDuplicateMilestone(milestone)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openMilestoneDialog(milestone)}>
            <Target className="mr-2 h-4 w-4" />
            Link tasks
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDeleteMilestone(milestone)} className="text-rose-600 focus:text-rose-600">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const toggleSprintTeamMember = (memberId: string, checked: boolean) => {
    setSprintDraft((current) => ({
      ...current,
      teamMemberIds: checked
        ? Array.from(new Set([...current.teamMemberIds, memberId]))
        : current.teamMemberIds.filter((id) => id !== memberId),
    }));
  };

  const handleAssignToSelectedSprint = (taskId: string) => {
    if (!selectedSprint) {
      toast.error("Select a sprint first");
      return;
    }

    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      toast.error("Task not found");
      return;
    }

    const assignmentError = getBacklogAssignmentError(task, selectedSprint);
    if (assignmentError) {
      toast.error(assignmentError);
      return;
    }

    const nextSprints = sprints.map((sprint) =>
      sprint.id === selectedSprint.id
        ? {
            ...sprint,
            updatedAt: new Date().toISOString(),
            taskAssignments: sprint.taskAssignments.some((assignment) => assignment.taskId === taskId)
              ? sprint.taskAssignments
              : [...sprint.taskAssignments, { taskId, stage: "BACKLOG" as SprintStageKey }],
          }
        : sprint
    );
    persistSprints(nextSprints);
  };

  const handleSprintStageChange = (taskId: string, stage: SprintStageKey) => {
    if (!selectedSprint) return;
    const nextSprints = sprints.map((sprint) => {
      if (sprint.id !== selectedSprint.id) {
        return sprint;
      }

      const nextAssignments = sprint.taskAssignments.map((assignment) =>
        assignment.taskId === taskId ? { ...assignment, stage } : assignment
      );
      const allDone = nextAssignments.length > 0 && nextAssignments.every((assignment) => assignment.stage === "DONE");
      const nextStatus: SprintStatus = allDone
        ? "COMPLETED"
        : sprint.status === "COMPLETED"
          ? "ACTIVE"
          : sprint.status;

      return {
        ...sprint,
        status: nextStatus,
        completedAt: allDone ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
        taskAssignments: nextAssignments,
      };
    });
    persistSprints(nextSprints);
  };

  const handleRemoveTaskFromSprint = (taskId: string) => {
    if (!selectedSprint) return;

    const nextSprints = sprints.map((sprint) =>
      sprint.id === selectedSprint.id
        ? {
            ...sprint,
            updatedAt: new Date().toISOString(),
            taskAssignments: sprint.taskAssignments.filter((assignment) => assignment.taskId !== taskId),
          }
        : sprint
    );
    persistSprints(nextSprints);
  };

  const handleSprintTaskDragStart = (taskId: string) => {
    setDraggedSprintTaskId(taskId);
  };

  const handleSprintTaskDragEnd = () => {
    setDraggedSprintTaskId(null);
    setDragOverSprintStage(null);
  };

  const handleSprintTaskDrop = (stage: SprintStageKey) => {
    if (!draggedSprintTaskId) {
      return;
    }

    handleSprintStageChange(draggedSprintTaskId, stage);
    setDraggedSprintTaskId(null);
    setDragOverSprintStage(null);
  };

  const handleMoveIncompleteTasks = () => {
    if (!selectedSprint) {
      toast.error("Select a sprint first");
      return;
    }

    const ordered = sortSprintsByDate(sprints);
    const currentIndex = ordered.findIndex((sprint) => sprint.id === selectedSprint.id);
    const nextSprint = ordered
      .slice(currentIndex + 1)
      .find(
        (sprint) =>
          sprint.status !== "CANCELLED" && sprint.milestoneId === selectedSprint.milestoneId
      );

    if (!nextSprint) {
      toast.error("No next sprint found in this milestone");
      return;
    }

    const movedTaskIds = selectedSprint.taskAssignments
      .filter((assignment) => {
        if (assignment.stage === "DONE") {
          return false;
        }

        const task = tasks.find((item) => item.id === assignment.taskId);
        if (!task) {
          return false;
        }

        const taskAssigneeId = task.employeeAssigneeId || task.assigneeId;
        if (
          taskAssigneeId &&
          nextSprint.teamMemberIds.length > 0 &&
          !nextSprint.teamMemberIds.includes(taskAssigneeId)
        ) {
          return false;
        }

        return true;
      })
      .map((assignment) => assignment.taskId);

    const nextSprints = sprints.map((sprint) => {
      if (sprint.id === selectedSprint.id) {
        return {
          ...sprint,
          updatedAt: new Date().toISOString(),
          taskAssignments: sprint.taskAssignments.filter((assignment) => assignment.stage === "DONE"),
        };
      }
      if (sprint.id === nextSprint.id) {
        const existingIds = new Set(sprint.taskAssignments.map((assignment) => assignment.taskId));
        return {
          ...sprint,
          updatedAt: new Date().toISOString(),
          taskAssignments: [
            ...sprint.taskAssignments,
            ...movedTaskIds
              .filter((taskId) => !existingIds.has(taskId))
              .map((taskId) => ({ taskId, stage: "BACKLOG" as SprintStageKey })),
          ],
        };
      }
      return sprint;
    });

    persistSprints(nextSprints);
  };

  const handleCreateMilestone = () => {
    const payload = resolveMilestoneDraftPayload(milestoneDraft);
    if (!payload) {
      return;
    }

    const now = new Date().toISOString();
    const nextMilestone: ProjectMilestone = {
      id: crypto.randomUUID(),
      title: payload.title,
      description: payload.description,
      startDate: payload.startDate,
      targetDate: payload.targetDate,
      status: payload.status,
      ownerId: payload.owner?.id,
      ownerName: payload.owner?.name,
      taskLinks: [],
      createdAt: now,
      updatedAt: now,
    };

    setCreateMilestoneDialogOpen(false);
    if (isCreateMilestoneFocusActive) {
      clearFocusQueryParam();
    }
    setMilestoneDraft(makeMilestoneDraft());
    persistMilestones([nextMilestone, ...milestones]);
  };

  const handleSprintMilestoneChange = (milestoneId: string) => {
    setSprintDraft((current) => ({ ...current, milestoneId }));
  };

  const handleCreateSprint = () => {
    if (!sprintDraft.name.trim()) {
      toast.error("Sprint name is required");
      return;
    }
    if (!sprintDraft.milestoneId) {
      toast.error("Select a milestone for this sprint");
      return;
    }
    const startDate = new Date(sprintDraft.startDate);
    const endDate = new Date(sprintDraft.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || isAfter(startDate, endDate)) {
      toast.error("Sprint dates are invalid");
      return;
    }
    const selectedMilestoneForSprint = milestones.find((milestone) => milestone.id === sprintDraft.milestoneId);
    if (!selectedMilestoneForSprint) {
      toast.error("Select a valid milestone");
      return;
    }
    if (!isSprintWithinMilestoneWindow({ startDate: sprintDraft.startDate, endDate: sprintDraft.endDate }, selectedMilestoneForSprint)) {
      toast.error("Sprint must stay inside the milestone date range");
      return;
    }
    if (sprintDraft.status === "ACTIVE" && activeSprintCount > 0) {
      toast.error("Only one sprint can be active at a time");
      return;
    }
    if (sprintDraft.teamMemberIds.length === 0) {
      toast.error("Select at least one sprint team member");
      return;
    }

    const now = new Date().toISOString();
    const owner =
      sprintDraft.ownerId !== "unassigned" ? teamMemberMap.get(sprintDraft.ownerId) ?? null : null;
    const nextTeamMemberIds = Array.from(
      new Set(
        owner?.id
          ? [...sprintDraft.teamMemberIds, owner.id]
          : sprintDraft.teamMemberIds
      )
    );
    const nextSprint: ProjectSprint = {
      id: crypto.randomUUID(),
      name: sprintDraft.name.trim(),
      goal: sprintDraft.goal.trim(),
      milestoneId: sprintDraft.milestoneId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status: sprintDraft.status,
      ownerId: owner?.id,
      ownerName: owner?.name || sprintDraft.ownerName.trim() || "Unassigned",
      teamMemberIds: nextTeamMemberIds,
      taskAssignments: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    setCreateSprintDialogOpen(false);
    if (isCreateSprintFocusActive) {
      clearFocusQueryParam();
    }
    setSprintDraft(makeSprintDraft());
    persistSprints([nextSprint, ...sprints]);
    setSelectedSprintId(nextSprint.id);
  };

  const handleCreateSprintTask = async () => {
    if (!selectedSprint) {
      toast.error("Select a sprint first");
      return;
    }
    if (!sprintTaskDraft.title.trim()) {
      toast.error("Task title is required");
      return;
    }

    const dueDate = new Date(sprintTaskDraft.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      toast.error("Task due date is invalid");
      return;
    }

    if (!isTaskWithinSprintWindow({ dueDate: dueDate.toISOString() }, selectedSprint)) {
      toast.error("Task due date must stay inside the selected sprint");
      return;
    }

    if (
      sprintTaskDraft.assigneeId !== "unassigned" &&
      selectedSprint.teamMemberIds.length > 0 &&
      !selectedSprint.teamMemberIds.includes(sprintTaskDraft.assigneeId)
    ) {
      toast.error("Task assignee must be part of the sprint team");
      return;
    }

    setIsCreatingSprintTask(true);
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("title", sprintTaskDraft.title.trim());
    formData.set("description", sprintTaskDraft.description.trim());
    formData.set("priority", sprintTaskDraft.priority);
    formData.set("dueDate", sprintTaskDraft.dueDate);
    if (sprintTaskDraft.assigneeId !== "unassigned") {
      formData.set("assigneeId", sprintTaskDraft.assigneeId);
    }

    const result = await createProjectTask(formData);
    setIsCreatingSprintTask(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    const nextTasks = result.data ?? tasks;
    setTasks(nextTasks);
    const createdTask = nextTasks.find(
      (task) => !tasks.some((existingTask) => existingTask.id === task.id)
    );
    if (!createdTask) {
      toast.success("Task created");
      return;
    }

    setSprintTaskDraft(makeSprintTaskDraft());
    const nextSprints = sprints.map((sprint) =>
      sprint.id === selectedSprint.id
        ? {
            ...sprint,
            status: sprint.status === "PLANNED" ? "ACTIVE" : sprint.status,
            updatedAt: new Date().toISOString(),
            taskAssignments: [
              ...sprint.taskAssignments,
              { taskId: createdTask.id, stage: "BACKLOG" as SprintStageKey },
            ],
          }
        : sprint
    );
    persistSprints(nextSprints);
    toast.success("Sprint task created");
  };

  const currentMilestone = milestoneDialogId
    ? milestones.find((milestone) => milestone.id === milestoneDialogId) ?? null
    : null;

  if (isLoading) {
    return <div className="rounded-xl border border-dashed p-6 text-sm text-slate-500">Loading workflow...</div>;
  }

  return (
    <div className="space-y-6">
      {section === "milestones" ? (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-5">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Milestones</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{milestoneSummary.total}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Reached</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{milestoneSummary.reached}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Delayed</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{milestoneSummary.delayed}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Upcoming</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{milestoneSummary.upcoming}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Workflow Progress</CardTitle></CardHeader><CardContent className="space-y-3"><div className="text-2xl font-bold">{milestoneSummary.progress}%</div><Progress value={milestoneSummary.progress} className="h-2" /></CardContent></Card>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-500" />
              <Input className="w-[220px]" value={milestoneSearch} onChange={(e) => setMilestoneSearch(e.target.value)} placeholder="Search milestones" />
            </div>
            <Select value={milestoneStatusFilter} onValueChange={(value) => setMilestoneStatusFilter(value as MilestoneStatus | "all")}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {MILESTONE_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={milestoneDateFilter} onValueChange={(value) => setMilestoneDateFilter(value as typeof milestoneDateFilter)}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Target date" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="overdue">Delayed</SelectItem>
                <SelectItem value="reached">Reached</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              {canManage ? (
                <Button type="button" size="sm" onClick={() => setCreateMilestoneDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Milestone
                </Button>
              ) : null}
              {hasMilestoneFiltersActive ? (
                <Button type="button" variant="outline" size="sm" onClick={resetMilestoneFilters}>
                  <FilterX className="mr-2 h-4 w-4" />
                  Reset filters
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={refreshState}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {milestoneCards.length === 0 ? (
            <Card>
              <CardContent className="space-y-3 py-10 text-center">
                <p className="text-base font-semibold text-slate-900">
                  {milestones.length === 0 ? "No milestones created yet" : "No milestones match the current filters"}
                </p>
                <p className="text-sm text-slate-500">
                  {milestones.length === 0
                    ? "Use the Create Milestone form to add the first major delivery phase for this project."
                    : "Try clearing the search or filter options to see more milestones."}
                </p>
                {hasMilestoneFiltersActive ? (
                  <div className="flex justify-center">
                    <Button type="button" variant="outline" onClick={resetMilestoneFilters}>
                      <FilterX className="mr-2 h-4 w-4" />
                      Clear filters
                    </Button>
                  </div>
                ) : canManage ? (
                  <div className="flex justify-center">
                    <Button type="button" onClick={() => setCreateMilestoneDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Milestone
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Deadline</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Progress</th>
                      <th className="px-4 py-3">Work</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {milestoneCards.map((milestone) => {
                      const completion = getMilestoneCompletionPercent(milestone, tasks, sprints);
                      const derivedStatus = getDerivedMilestoneStatus(milestone, tasks, sprints);
                      const sprintCount = getMilestoneSprintCount(milestone, sprints);
                      const completedSprints = getMilestoneCompletedSprintCount(milestone, sprints, tasks);
                      const pendingSprints = getMilestonePendingSprintCount(milestone, sprints, tasks);
                      const linkedTaskCount = getMilestoneTaskCount(milestone, sprints);

                      return (
                        <tr key={milestone.id} className="align-top">
                          <td className="px-4 py-4">
                            <div className="min-w-[220px]">
                              <p className="font-semibold text-slate-900">{milestone.title}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {milestone.description || "No description"}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="min-w-[150px] text-slate-700">
                              <p>{format(new Date(milestone.targetDate), "dd MMM yyyy")}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                Start: {format(new Date(milestone.startDate), "dd MMM yyyy")}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge>{getMilestoneStatusLabel(derivedStatus)}</Badge>
                          </td>
                          <td className="px-4 py-4">
                            <div className="min-w-[150px] space-y-2">
                              <p className="font-medium text-slate-900">{completion}%</p>
                              <Progress value={completion} className="h-2" />
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="min-w-[140px] text-slate-700">
                              <p>{linkedTaskCount} linked tasks</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {completedSprints}/{sprintCount} complete, {pendingSprints} pending
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-slate-700">
                              {milestone.ownerName || "Unassigned owner"}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              {canManage ? (
                                <>
                                  <Button type="button" variant="outline" size="sm" onClick={() => openMilestoneDialog(milestone)}>
                                    View Tasks
                                  </Button>
                                  {renderMilestoneActions(milestone)}
                                </>
                              ) : (
                                <span className="text-xs text-slate-400">No actions</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-500" />
              <Input className="w-[220px]" value={sprintListSearch} onChange={(e) => setSprintListSearch(e.target.value)} placeholder="Search sprints" />
            </div>
            <Select value={sprintListStatusFilter} onValueChange={(value) => setSprintListStatusFilter(value as SprintStatus | "all")}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {SPRINT_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sprintListMilestoneFilter} onValueChange={setSprintListMilestoneFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Milestone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Milestones</SelectItem>
                {sprintMilestoneOptions.map((milestone) => <SelectItem key={milestone.id} value={milestone.id}>{milestone.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              {canManage ? (
                <Button type="button" size="sm" onClick={() => setCreateSprintDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Sprint
                </Button>
              ) : null}
              {hasSprintListFiltersActive ? (
                <Button type="button" variant="outline" size="sm" onClick={resetSprintListFilters}>
                  <FilterX className="mr-2 h-4 w-4" />
                  Reset filters
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={refreshState}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {sprintListItems.length === 0 ? (
            <Card>
              <CardContent className="space-y-3 py-10 text-center">
                <p className="text-base font-semibold text-slate-900">
                  {sprints.length === 0 ? "No sprints created yet" : "No sprints match the current filters"}
                </p>
                <p className="text-sm text-slate-500">
                  {sprints.length === 0
                    ? "Use Create Sprint to plan the first sprint inside a milestone."
                    : "Try clearing the search or filter options to see more sprints."}
                </p>
                {hasSprintListFiltersActive ? (
                  <div className="flex justify-center">
                    <Button type="button" variant="outline" onClick={resetSprintListFilters}>
                      <FilterX className="mr-2 h-4 w-4" />
                      Clear filters
                    </Button>
                  </div>
                ) : canManage ? (
                  <div className="flex justify-center">
                    <Button type="button" onClick={() => setCreateSprintDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Sprint
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Window</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Progress</th>
                      <th className="px-4 py-3">Work</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {sprintListItems.map((sprint) => {
                      const progress = getSprintProgressPercent(sprint, tasks);
                      const completedTasks = getSprintCompletedTaskCount(sprint, tasks);
                      const pendingTasks = getSprintPendingTaskCount(sprint, tasks);
                      const overdue = isSprintOverdue(sprint, tasks);
                      const selected = selectedSprint?.id === sprint.id;
                      const milestone = milestones.find((item) => item.id === sprint.milestoneId) ?? null;

                      return (
                        <tr key={sprint.id} className={selected ? "bg-sky-50/70" : undefined}>
                          <td className="px-4 py-4">
                            <div className="min-w-[220px]">
                              <p className="font-semibold text-slate-900">{sprint.name}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {sprint.goal || "No sprint goal provided"}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="min-w-[180px] text-slate-700">
                              <p>{getSprintDeadlineLabel(sprint)}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                Start: {format(new Date(sprint.startDate), "dd MMM yyyy")}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex min-w-[140px] flex-wrap gap-2">
                              <Badge variant="secondary" className={sprint.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : overdue ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}>
                                {sprint.status.replace("_", " ")}
                              </Badge>
                              {milestone ? <Badge variant="outline">{milestone.title}</Badge> : null}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="min-w-[150px] space-y-2">
                              <p className="font-medium text-slate-900">{progress}%</p>
                              <Progress value={progress} className="h-2" />
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="min-w-[160px] text-slate-700">
                              <p>{sprint.taskAssignments.length} tasks tracked</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {completedTasks} completed, {pendingTasks} pending
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="min-w-[140px] text-slate-700">
                              <p>{sprint.ownerName || "Unassigned owner"}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {sprint.teamMemberIds.length} team members
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant={selected ? "secondary" : "outline"} size="sm" onClick={() => setSelectedSprintId(sprint.id)}>
                                {selected ? "Selected" : "Open"}
                              </Button>
                              {canManage ? (
                                <>
                                  <Button type="button" size="sm" variant="outline" onClick={() => {
                                    persistSprints(sprints.map((item) => item.id === sprint.id ? { ...item, status: item.status === "ACTIVE" ? "PLANNED" : "ACTIVE", updatedAt: new Date().toISOString() } : item));
                                  }}>
                                    {sprint.status === "ACTIVE" ? "Pause" : "Activate"}
                                  </Button>
                                  <Button type="button" size="sm" variant="ghost" onClick={() => {
                                    persistSprints(sprints.map((item) => item.id === sprint.id ? { ...item, status: "COMPLETED", completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item));
                                  }}>
                                    Complete
                                  </Button>
                                  <Button type="button" size="sm" variant="ghost" onClick={() => {
                                    persistSprints(sprints.filter((item) => item.id !== sprint.id));
                                  }}>
                                    Delete
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <Select value={sprintFilters.assignee} onValueChange={(value) => setSprintFilters((cur) => ({ ...cur, assignee: value }))}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Assignee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assignees</SelectItem>
                    {Array.from(new Set(tasks.map(getTaskAssigneeDisplay))).sort().map((assignee) => (
                      <SelectItem key={assignee} value={assignee}>{assignee}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sprintFilters.status} onValueChange={(value) => setSprintFilters((cur) => ({ ...cur, status: value as SprintStageKey | "all" }))}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Stage" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    {SPRINT_STAGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sprintFilters.milestone} onValueChange={(value) => setSprintFilters((cur) => ({ ...cur, milestone: value }))}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Milestone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Milestones</SelectItem>
                    {milestones.map((milestone) => <SelectItem key={milestone.id} value={milestone.id}>{milestone.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sprintFilters.deadline} onValueChange={(value) => setSprintFilters((cur) => ({ ...cur, deadline: value as SprintTaskFilters["deadline"] }))}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Deadline" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Deadlines</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="dueSoon">Due Soon</SelectItem>
                    <SelectItem value="noDueDate">No Due Date</SelectItem>
                  </SelectContent>
                </Select>
                <div className="ml-auto flex items-center gap-2">
                  <Search className="h-4 w-4 text-slate-500" />
                  <Input value={sprintTaskSearch} onChange={(e) => setSprintTaskSearch(e.target.value)} placeholder="Search sprint tasks" className="w-[220px]" />
                </div>
              </div>

              {!selectedSprint ? (
                <Card><CardContent className="py-10 text-center text-sm text-slate-500">Create or select a sprint to continue.</CardContent></Card>
              ) : (
                <>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{selectedSprint.name}</CardTitle>
                        <p className="text-sm text-slate-500">{selectedSprint.goal || "No sprint goal provided"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{selectedSprint.status.replace("_", " ")}</Badge>
                        <Badge variant="outline">{selectedSprintSummary.progress}% progress</Badge>
                        {canManage ? <Button type="button" variant="outline" onClick={handleMoveIncompleteTasks}>Move incomplete tasks</Button> : null}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {selectedSprintMilestone ? (
                          <Badge variant="outline" className="text-xs">
                            Milestone: {selectedSprintMilestone.title}
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="text-xs">
                          Window: {format(new Date(selectedSprint.startDate), "dd MMM")} - {format(new Date(selectedSprint.endDate), "dd MMM yyyy")}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Owner: {selectedSprint.ownerName || "Unassigned"}
                        </Badge>
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Total</p><p className="mt-1 text-xl font-semibold">{selectedSprintSummary.total}</p></div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Completed</p><p className="mt-1 text-xl font-semibold">{selectedSprintSummary.completed}</p></div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Pending</p><p className="mt-1 text-xl font-semibold">{selectedSprintSummary.pending}</p></div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Overdue</p><p className="mt-1 text-xl font-semibold">{selectedSprintSummary.overdue}</p></div>
                      </div>
                      <Progress value={selectedSprintSummary.progress} className="mt-4 h-2" />
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">Sprint Team</p>
                          <Badge variant="secondary">{selectedSprintTeamMembers.length} members</Badge>
                        </div>
                        {selectedSprintTeamMembers.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500">No sprint team members selected.</p>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedSprintTeamMembers.map((member) => (
                              <Badge key={member.id} variant="outline" className="text-xs">
                                {member.name}
                                {member.role ? ` - ${member.role}` : ""}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 xl:grid-cols-5">
                    {SPRINT_STAGE_OPTIONS.map((option) => (
                      <Card
                        key={option.value}
                        className={`min-h-[260px] ${dragOverSprintStage === option.value ? "border-sky-300 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]" : ""}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (dragOverSprintStage !== option.value) {
                            setDragOverSprintStage(option.value);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleSprintTaskDrop(option.value);
                        }}
                        onDragLeave={() => {
                          if (dragOverSprintStage === option.value) {
                            setDragOverSprintStage(null);
                          }
                        }}
                      >
                        <CardHeader className="border-b py-3"><CardTitle className="text-sm font-semibold">{option.label} <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{selectedSprintTaskBuckets[option.value].length}</span></CardTitle></CardHeader>
                        <CardContent className="space-y-3 p-4">
                          {selectedSprintTaskBuckets[option.value].length === 0 ? (
                            <p className="text-xs text-slate-500">No tasks</p>
                          ) : selectedSprintTaskBuckets[option.value].map((task) => {
                            const milestoneId = getTaskMilestoneId(task.id, milestones, sprints);
                            const stage = getTaskSprintStage(task.id, selectedSprint);
                            const sprintTaskMilestone = milestoneId ? milestones.find((item) => item.id === milestoneId) ?? null : null;
                            return (
                              <div
                                key={task.id}
                                draggable={canManage}
                                onDragStart={() => handleSprintTaskDragStart(task.id)}
                                onDragEnd={handleSprintTaskDragEnd}
                                className={`rounded-xl border border-slate-200 bg-slate-50 p-3 ${draggedSprintTaskId === task.id ? "opacity-70" : ""}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex min-w-0 items-start gap-2">
                                    {canManage ? <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : null}
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold text-slate-900">{getTaskTitle(task)}</p>
                                      <p className="text-xs text-slate-500">{getTaskAssigneeDisplay(task)}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-[11px]">
                                      {getTaskPriorityLabel(task)}
                                    </Badge>
                                    <Clock3 className="h-4 w-4 text-slate-400" />
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                                  <span>{getTaskDueLabel(task)}</span>
                                  {sprintTaskMilestone ? <Badge variant="outline" className="text-xs">{sprintTaskMilestone.title}</Badge> : null}
                                </div>
                                {task.description ? <p className="mt-2 line-clamp-2 text-xs text-slate-500">{task.description}</p> : null}
                                {canManage ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <Select value={stage} onValueChange={(value) => handleSprintStageChange(task.id, value as SprintStageKey)}>
                                      <SelectTrigger className="h-8 flex-1 min-w-[128px]"><SelectValue /></SelectTrigger>
                                      <SelectContent>{SPRINT_STAGE_OPTIONS.map((stageOption) => <SelectItem key={stageOption.value} value={stageOption.value}>{stageOption.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveTaskFromSprint(task.id)}>
                                      Remove
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {canManage ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Create Task Inside Sprint</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="sprint-task-title">Task Title</Label>
                          <Input
                            id="sprint-task-title"
                            value={sprintTaskDraft.title}
                            onChange={(event) => setSprintTaskDraft((current) => ({ ...current, title: event.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Assign To</Label>
                          <Select value={sprintTaskDraft.assigneeId} onValueChange={(value) => setSprintTaskDraft((current) => ({ ...current, assigneeId: value }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select assignee" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {selectedSprintTeamMembers.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 lg:col-span-2">
                          <Label htmlFor="sprint-task-description">Description</Label>
                          <Textarea
                            id="sprint-task-description"
                            value={sprintTaskDraft.description}
                            onChange={(event) => setSprintTaskDraft((current) => ({ ...current, description: event.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Priority</Label>
                          <Select value={sprintTaskDraft.priority} onValueChange={(value) => setSprintTaskDraft((current) => ({ ...current, priority: value }))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Low</SelectItem>
                              <SelectItem value="2">Medium</SelectItem>
                              <SelectItem value="3">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sprint-task-due-date">Due Date</Label>
                          <Input
                            id="sprint-task-due-date"
                            type="date"
                            value={sprintTaskDraft.dueDate}
                            min={format(new Date(selectedSprint.startDate), "yyyy-MM-dd")}
                            max={format(new Date(selectedSprint.endDate), "yyyy-MM-dd")}
                            onChange={(event) => setSprintTaskDraft((current) => ({ ...current, dueDate: event.target.value }))}
                          />
                        </div>
                        <div className="flex justify-end lg:col-span-2">
                          <Button type="button" onClick={handleCreateSprintTask} disabled={isCreatingSprintTask}>
                            <Plus className="mr-2 h-4 w-4" />
                            {isCreatingSprintTask ? "Creating..." : "Create Sprint Task"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Backlog Tasks</CardTitle>
                        <p className="text-sm text-slate-500">Assign backlog work into the selected sprint.</p>
                      </div>
                      <Badge variant="secondary">{backlogTasks.length} backlog tasks</Badge>
                    </CardHeader>
                    <CardContent>
                      {backlogTasks.length === 0 ? (
                        <p className="text-sm text-slate-500">No backlog tasks available.</p>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {backlogTasks.map((task) => {
                            const assignmentError = getBacklogAssignmentError(task, selectedSprint);
                            const milestoneId = getTaskMilestoneId(task.id, milestones, sprints);
                            const milestone = milestoneId ? milestones.find((item) => item.id === milestoneId) ?? null : null;
                            return (
                              <div key={task.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-900">{getTaskTitle(task)}</p>
                                    <p className="text-xs text-slate-500">{getTaskDueLabel(task)}</p>
                                  </div>
                                  {canManage ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={Boolean(assignmentError)}
                                      onClick={() => handleAssignToSelectedSprint(task.id)}
                                    >
                                      Assign
                                    </Button>
                                  ) : null}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                                  <span>{getTaskAssigneeDisplay(task)}</span>
                                  <Badge variant="secondary" className="text-[11px]">
                                    {getTaskPriorityLabel(task)}
                                  </Badge>
                                  {milestone ? <Badge variant="outline" className="text-xs">{milestone.title}</Badge> : <Badge variant="outline" className="text-xs">Unlinked milestone</Badge>}
                                </div>
                                {assignmentError ? <p className="mt-2 text-xs text-amber-700">{assignmentError}</p> : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base">Sprint History</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {sortSprintsByDate(sprints).filter((sprint) => sprint.status === "COMPLETED").length === 0 ? (
                        <p className="text-sm text-slate-500">Completed sprint history will appear here.</p>
                      ) : (
                        sortSprintsByDate(sprints).filter((sprint) => sprint.status === "COMPLETED").map((sprint) => (
                          <div key={sprint.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="font-semibold text-slate-900">{sprint.name}</p>
                                <p className="text-xs text-slate-500">{sprint.goal}</p>
                              </div>
                              <Badge variant="secondary">Completed</Badge>
                            </div>
                            <div className="mt-2 text-sm text-slate-600">
                              {getSprintCompletedTaskCount(sprint, tasks)} completed of {sprint.taskAssignments.length} tasks
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
        </div>
      )}

      <Dialog open={isCreateMilestonePanelOpen} onOpenChange={handleCreateMilestoneDialogOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Milestone</DialogTitle>
            <DialogDescription>
              Add a milestone after reviewing the current milestone list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="milestone-title">Milestone Title</Label>
              <Input id="milestone-title" value={milestoneDraft.title} onChange={(e) => setMilestoneDraft((cur) => ({ ...cur, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="milestone-start-date">Start Date</Label>
              <Input
                id="milestone-start-date"
                type="date"
                min={projectWindow.start ? format(projectWindow.start, "yyyy-MM-dd") : undefined}
                max={milestoneDraft.targetDate}
                value={milestoneDraft.startDate}
                onChange={(e) => setMilestoneDraft((cur) => ({ ...cur, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="milestone-date">Target Date</Label>
              <Input
                id="milestone-date"
                type="date"
                min={milestoneDraft.startDate}
                max={projectWindow.end ? format(projectWindow.end, "yyyy-MM-dd") : undefined}
                value={milestoneDraft.targetDate}
                onChange={(e) => setMilestoneDraft((cur) => ({ ...cur, targetDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={milestoneDraft.ownerId} onValueChange={(value) => setMilestoneDraft((cur) => ({ ...cur, ownerId: value }))}>
                <SelectTrigger><SelectValue placeholder="Milestone owner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 xl:col-span-4">
              <Label htmlFor="milestone-description">Description</Label>
              <Textarea id="milestone-description" value={milestoneDraft.description} onChange={(e) => setMilestoneDraft((cur) => ({ ...cur, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={milestoneDraft.status} onValueChange={(value) => setMilestoneDraft((cur) => ({ ...cur, status: value as MilestoneStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MILESTONE_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleCreateMilestoneDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateMilestone} disabled={isPending || isSavingMilestones}>
              <Plus className="mr-2 h-4 w-4" />
              Add Milestone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateSprintPanelOpen} onOpenChange={handleCreateSprintDialogOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Sprint</DialogTitle>
            <DialogDescription>
              Add a sprint after reviewing the current sprint list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sprint-name">Sprint Name</Label>
              <Input id="sprint-name" value={sprintDraft.name} onChange={(e) => setSprintDraft((cur) => ({ ...cur, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Milestone</Label>
              <Select value={sprintDraft.milestoneId} onValueChange={handleSprintMilestoneChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select milestone" />
                </SelectTrigger>
                <SelectContent>
                  {sprintMilestoneOptions.map((milestone) => (
                    <SelectItem key={milestone.id} value={milestone.id}>
                      {milestone.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="sprint-goal">Sprint Goal</Label>
              <Textarea id="sprint-goal" value={sprintDraft.goal} onChange={(e) => setSprintDraft((cur) => ({ ...cur, goal: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sprint-start">Start Date</Label>
              <Input
                id="sprint-start"
                type="date"
                min={
                  selectedSprintDraftMilestone
                    ? formatWorkflowDateInput(selectedSprintDraftMilestone.startDate)
                    : projectWindow.start
                      ? format(projectWindow.start, "yyyy-MM-dd")
                      : undefined
                }
                max={
                  selectedSprintDraftMilestone
                    ? formatWorkflowDateInput(selectedSprintDraftMilestone.targetDate)
                    : projectWindow.end
                      ? format(projectWindow.end, "yyyy-MM-dd")
                      : undefined
                }
                value={sprintDraft.startDate}
                onChange={(e) => setSprintDraft((cur) => ({ ...cur, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sprint-end">End Date</Label>
              <Input
                id="sprint-end"
                type="date"
                min={sprintDraft.startDate}
                max={
                  selectedSprintDraftMilestone
                    ? formatWorkflowDateInput(selectedSprintDraftMilestone.targetDate)
                    : projectWindow.end
                      ? format(projectWindow.end, "yyyy-MM-dd")
                      : undefined
                }
                value={sprintDraft.endDate}
                onChange={(e) => setSprintDraft((cur) => ({ ...cur, endDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Owner / Scrum Lead</Label>
              <Select value={sprintDraft.ownerId} onValueChange={(value) => setSprintDraft((cur) => ({ ...cur, ownerId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Sprint owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={sprintDraft.status} onValueChange={(value) => setSprintDraft((cur) => ({ ...cur, status: value as SprintStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SPRINT_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-3 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Sprint Team</Label>
                <Badge variant="secondary">{sprintDraft.teamMemberIds.length} selected</Badge>
              </div>
              {teamMembers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                  Add project team members before creating a sprint team.
                </div>
              ) : (
                <div className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {teamMembers.map((member) => {
                    const checked = sprintDraft.teamMemberIds.includes(member.id);
                    return (
                      <label key={member.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleSprintTeamMember(member.id, value === true)} />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900">{member.name}</span>
                          <span className="block text-xs text-slate-500">{member.role || "Team member"}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 lg:col-span-2">
              Every sprint must stay inside the milestone date range and can only assign project team members.
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleCreateSprintDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateSprint} disabled={isPending || isSavingSprints}>
              <Plus className="mr-2 h-4 w-4" />
              Add Sprint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={milestoneEditorOpen}
        onOpenChange={(open) => {
          setMilestoneEditorOpen(open);
          if (!open) {
            setEditingMilestoneId(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Milestone</DialogTitle>
            <DialogDescription>Update milestone scope, timeline, owner, and delivery status.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="milestone-editor-title">Milestone Title</Label>
              <Input
                id="milestone-editor-title"
                value={milestoneEditorDraft.title}
                onChange={(event) => setMilestoneEditorDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={milestoneEditorDraft.ownerId} onValueChange={(value) => setMilestoneEditorDraft((current) => ({ ...current, ownerId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Milestone owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="milestone-editor-start-date">Start Date</Label>
              <Input
                id="milestone-editor-start-date"
                type="date"
                value={milestoneEditorDraft.startDate}
                onChange={(event) => setMilestoneEditorDraft((current) => ({ ...current, startDate: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="milestone-editor-target-date">Target Date</Label>
              <Input
                id="milestone-editor-target-date"
                type="date"
                value={milestoneEditorDraft.targetDate}
                onChange={(event) => setMilestoneEditorDraft((current) => ({ ...current, targetDate: event.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="milestone-editor-description">Description</Label>
              <Textarea
                id="milestone-editor-description"
                value={milestoneEditorDraft.description}
                onChange={(event) => setMilestoneEditorDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={milestoneEditorDraft.status} onValueChange={(value) => setMilestoneEditorDraft((current) => ({ ...current, status: value as MilestoneStatus }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MILESTONE_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setMilestoneEditorOpen(false);
                setEditingMilestoneId(null);
              }}>
                Cancel
              </Button>
              <Button type="button" onClick={handleUpdateMilestone} disabled={isPending || isSavingMilestones}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Tasks to Milestone</DialogTitle>
            <DialogDescription>Choose the tasks that support this milestone and mark mandatory items.</DialogDescription>
          </DialogHeader>
          {currentMilestone ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">{currentMilestone.title}</p>
                <p className="text-sm text-slate-500">{currentMilestone.description || "No description"}</p>
              </div>
              <ScrollArea className="h-[420px] rounded-xl border border-slate-200">
                <div className="space-y-2 p-4">
                  {tasks.map((task) => {
                    const state = milestoneTaskDraft[task.id] ?? { included: false, required: false };
                    const taskMilestoneId = getTaskMilestoneId(task.id, milestones, sprints);
                    const conflictingMilestone =
                      taskMilestoneId && taskMilestoneId !== currentMilestone.id
                        ? milestones.find((milestone) => milestone.id === taskMilestoneId) ?? null
                        : null;
                    return (
                      <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={state.included}
                            disabled={Boolean(conflictingMilestone)}
                            onCheckedChange={(checked) =>
                              setMilestoneTaskDraft((current) => ({
                                ...current,
                                [task.id]: {
                                  included: checked === true,
                                  required: checked === true ? current[task.id]?.required ?? false : false,
                                },
                              }))
                            }
                          />
                          <div>
                            <p className="text-sm font-medium text-slate-900">{task.title}</p>
                            <p className="text-xs text-slate-500">{getTaskAssigneeDisplay(task)}</p>
                            {conflictingMilestone ? (
                              <p className="text-xs text-amber-700">
                                Already linked to {conflictingMilestone.title}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <Checkbox
                            checked={state.required}
                            disabled={!state.included || Boolean(conflictingMilestone)}
                            onCheckedChange={(checked) =>
                              setMilestoneTaskDraft((current) => ({
                                ...current,
                                [task.id]: {
                                  included: true,
                                  required: checked === true,
                                },
                              }))
                            }
                          />
                          Required
                        </label>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setMilestoneDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveMilestoneLinks} disabled={isPending || isSavingMilestones}>
                  Save Links
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
