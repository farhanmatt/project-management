"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addProjectTaskSubtask, getProjectTasks, updateProjectTask } from "@/actions/project-task.actions";
import { addTaskComment, getTaskComments, type CommentNode } from "@/actions/project-comment.actions";
import { getTaskActivityLogs } from "@/actions/activity-log.actions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AdminProjectTaskBoard } from "@/components/projects/admin-project-task-monitor-parts/board";
import { DetailActivityContent, DetailMessagesContent, flattenComments, getTaskActivityMessage, type TaskActivityLogItem } from "@/components/projects/admin-project-task-monitor-parts/detail-side-panel-content";
import { DetailMainPanel } from "@/components/projects/admin-project-task-monitor-parts/detail-main-panel";
import { DetailMediaDialog } from "@/components/projects/admin-project-task-monitor-parts/detail-media-dialog";
import { DetailSidePanel } from "@/components/projects/admin-project-task-monitor-parts/detail-side-panel";
import { EmployeeProfileDialog } from "@/components/projects/admin-project-task-monitor-parts/employee-profile-dialog";
import {
  EMOJI_LIBRARY,
  type AdminProjectTaskMonitorProps,
  type EmojiOption,
  type TaskEmployeeProfileState,
} from "@/components/projects/admin-project-task-monitor-parts/shared";
import { useAdminProjectTaskDescription } from "@/components/projects/admin-project-task-monitor-parts/use-admin-project-task-description";
import { useProjectTaskPeople } from "@/components/projects/admin-project-task-monitor-parts/use-project-task-people";
import { getTaskPriorityLevel, normalizeTask, type ProjectTask } from "@/lib/project-task-utils";

export function AdminProjectTaskMonitor({
  projectId,
  assignments,
  employees,
  projectType,
  projectName,
  projectCategory,
  projectManagerName,
  projectTags,
  projectTeamId,
  initialTasks = [],
  initialStages = [],
  initialSelectedTaskId = null,
  standaloneTaskPage = false,
  taskDetailMode = "dialog",
}: AdminProjectTaskMonitorProps) {
  const router = useRouter();
  const { employeeAssignments, peopleMap, projectAssignableIds, projectTeamMembers } = useProjectTaskPeople({
    assignments,
    employees,
    projectTeamId,
  });

  const [tasks, setTasks] = useState<ProjectTask[]>(initialTasks);
  const [stages, setStages] = useState<{ id: string; name: string; sortOrder: number }[]>(() =>
    initialStages.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialSelectedTaskId);
  const [taskActivityLogs, setTaskActivityLogs] = useState<TaskActivityLogItem[]>([]);
  const [activeSidePanel, setActiveSidePanel] = useState<"messages" | "log" | "activity">("log");
  const [taskComments, setTaskComments] = useState<CommentNode[]>([]);
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [emojiCategory, setEmojiCategory] = useState<EmojiOption["category"]>("smileys");
  const [selectedAttachmentName, setSelectedAttachmentName] = useState("");
  const [showTaskSearch, setShowTaskSearch] = useState(false);
  const [taskSearchText, setTaskSearchText] = useState("");
  const [showTaskSearchFilter, setShowTaskSearchFilter] = useState(false);
  const [taskSearchFilter, setTaskSearchFilter] = useState<"all" | "conversations" | "tracked">("all");
  const [taskAssigneePopoverTaskId, setTaskAssigneePopoverTaskId] = useState<string | null>(null);
  const [selectedTaskEmployeeProfile, setSelectedTaskEmployeeProfile] = useState<TaskEmployeeProfileState | null>(null);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState("unassigned");
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const deferredEmojiSearch = useDeferredValue(emojiSearch);
  const deferredTaskSearchText = useDeferredValue(taskSearchText);

  useEffect(() => {
    getProjectTasks(projectId).then((result) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }

      startTransition(() => {
        setStages((result.stages ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder));
        setTasks((result.data ?? []).map(normalizeTask).filter((item): item is ProjectTask => Boolean(item)));
      });
    });
  }, [projectId]);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);

  const refreshTaskActivityLogs = useCallback(
    (taskId: string) => {
      getTaskActivityLogs(projectId, taskId).then((logs) => setTaskActivityLogs(logs));
    },
    [projectId]
  );

  const description = useAdminProjectTaskDescription({
    projectId,
    selectedTask,
    setTasks,
    onRefreshTaskActivity: refreshTaskActivityLogs,
  });

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    refreshTaskActivityLogs(selectedTaskId);
    getTaskComments(projectId, selectedTaskId).then((result) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }

      setTaskComments(result.data ?? []);
    });
  }, [projectId, refreshTaskActivityLogs, selectedTaskId]);

  useEffect(() => {
    if (!showEmojiPicker) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!emojiPickerRef.current) return;
      if (emojiPickerRef.current.contains(event.target as Node)) return;
      setShowEmojiPicker(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showEmojiPicker]);

  const filteredEmojiResults = useMemo(() => {
    const query = deferredEmojiSearch.trim().toLowerCase();
    return EMOJI_LIBRARY.filter((item) => item.category === emojiCategory && (!query || item.label.includes(query)));
  }, [deferredEmojiSearch, emojiCategory]);

  const handleTaskDeadlineUpdated = useCallback((taskId: string, dueDate: string | undefined) => {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, dueDate } : task)));
  }, []);

  const resetSubtaskForm = () => {
    setShowSubtaskForm(false);
    setSubtaskTitle("");
    setSubtaskAssigneeId("unassigned");
  };

  const resetTaskDetailState = () => {
    setSelectedTaskId(null);
    setTaskActivityLogs([]);
    setTaskComments([]);
    setMessageText("");
    setTaskAssigneePopoverTaskId(null);
    setActiveSidePanel("log");
    setShowTaskSearch(false);
    setTaskSearchText("");
    setShowTaskSearchFilter(false);
    resetSubtaskForm();
  };

  const closeTaskDetail = () => {
    if (standaloneTaskPage) {
      router.push(`/projects/${projectId}?view=kanban`);
      return;
    }

    resetTaskDetailState();
  };

  const normalizedTaskSearch = deferredTaskSearchText.trim().toLowerCase();
  const filteredTaskComments = useMemo(() => {
    const comments = flattenComments(taskComments);
    if (!normalizedTaskSearch) return comments;
    return comments.filter((comment) => {
      const author = (comment.author.name || comment.author.email || "").toLowerCase();
      return comment.text.toLowerCase().includes(normalizedTaskSearch) || author.includes(normalizedTaskSearch);
    });
  }, [normalizedTaskSearch, taskComments]);

  const filteredTaskActivityLogs = useMemo(() => {
    const logs = taskActivityLogs.filter((log) => {
      if (taskSearchFilter === "conversations") return log.entityType === "task_comment";
      if (taskSearchFilter === "tracked") return log.entityType !== "task_comment";
      return true;
    });
    if (!normalizedTaskSearch) return logs;
    return logs.filter((log) => {
      const message = getTaskActivityMessage(log, peopleMap);
      return [
        (log.createdBy.name || log.createdBy.email || "").toLowerCase(),
        message.title.toLowerCase(),
        String(message.to ?? "").toLowerCase(),
        message.from ? String(message.from).toLowerCase() : "",
        message.field.toLowerCase(),
      ].some((value) => value.includes(normalizedTaskSearch));
    });
  }, [normalizedTaskSearch, peopleMap, taskActivityLogs, taskSearchFilter]);

  const ensureTaskAssigneeIsProjectMember = async (assigneeId: string) => {
    if (!assigneeId || projectAssignableIds.has(assigneeId)) {
      return true;
    }

    toast.error("Only the assigned team leader and project team members can be selected");
    return false;
  };

  const openTaskEmployeeProfile = useCallback(
    (task: ProjectTask, employee: AdminProjectTaskMonitorProps["employees"][number]) => {
      setTaskAssigneePopoverTaskId(null);
      setSelectedTaskEmployeeProfile({ employee, taskTitle: task.title });
    },
    []
  );

  const assignEmployeeToTask = async (task: ProjectTask, assigneeId: string) => {
    const normalizedAssigneeId = assigneeId === "unassigned" ? "" : assigneeId;
    setAssigningTaskId(task.id);
    const isReadyToAssign = normalizedAssigneeId ? await ensureTaskAssigneeIsProjectMember(normalizedAssigneeId) : true;
    if (!isReadyToAssign) {
      setAssigningTaskId(null);
      return;
    }

    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("taskId", task.id);
    formData.append("title", task.title);
    formData.append("description", task.description ?? "");
    formData.append("assigneeId", normalizedAssigneeId);
    formData.append("priority", String(getTaskPriorityLevel(task)));
    if (task.dueDate) formData.append("dueDate", task.dueDate.slice(0, 10));
    if (task.stageId) formData.append("stageId", task.stageId);

    const result = await updateProjectTask(formData);
    setAssigningTaskId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    startTransition(() => {
      setTasks((result.data ?? []).map(normalizeTask).filter((item): item is ProjectTask => Boolean(item)));
    });
    setTaskAssigneePopoverTaskId(null);
    toast.success(normalizedAssigneeId ? "Team member assigned to task" : "Task assignee cleared");
    if (selectedTaskId) {
      refreshTaskActivityLogs(selectedTaskId);
    }
  };

  const moveTaskToStage = async (task: ProjectTask, targetStageId: string) => {
    if (!targetStageId || task.stageId === targetStageId) {
      return;
    }

    setMovingTaskId(task.id);
    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("taskId", task.id);
    formData.append("title", task.title);
    formData.append("description", task.description ?? "");
    formData.append("assigneeId", task.employeeAssigneeId || task.assigneeId || "");
    formData.append("priority", String(getTaskPriorityLevel(task)));
    formData.append("stageId", targetStageId);
    if (task.dueDate) formData.append("dueDate", task.dueDate.slice(0, 10));

    const result = await updateProjectTask(formData);
    setMovingTaskId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    startTransition(() => {
      setTasks((result.data ?? []).map(normalizeTask).filter((item): item is ProjectTask => Boolean(item)));
    });
  };

  const sendTaskMessage = () => {
    if (!selectedTaskId) {
      toast.error("Please open a task first");
      return;
    }
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage) {
      toast.error("Message is required");
      return;
    }

    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("taskId", selectedTaskId);
    formData.append("text", trimmedMessage);

    setIsSendingMessage(true);
    addTaskComment(formData).then((result) => {
      setIsSendingMessage(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      setMessageText("");
      setSelectedAttachmentName("");
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      setTaskComments(result.data ?? []);
      setActiveSidePanel("messages");
      toast.success("Message sent");
      refreshTaskActivityLogs(selectedTaskId);
    });
  };

  const addSubtask = () => {
    if (!selectedTaskId) {
      toast.error("Please open a task first");
      return;
    }
    const trimmedTitle = subtaskTitle.trim();
    if (!trimmedTitle) {
      toast.error("Sub-task title is required");
      return;
    }

    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("taskId", selectedTaskId);
    formData.append("title", trimmedTitle);
    if (subtaskAssigneeId !== "unassigned") formData.append("assigneeId", subtaskAssigneeId);

    setIsAddingSubtask(true);
    addProjectTaskSubtask(formData).then((result) => {
      setIsAddingSubtask(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      startTransition(() => {
        setTasks((result.data ?? []).map(normalizeTask).filter((item): item is ProjectTask => Boolean(item)));
      });
      resetSubtaskForm();
      toast.success("Sub-task added");
      refreshTaskActivityLogs(selectedTaskId);
    });
  };

  const taskAssignee =
    selectedTask && (selectedTask.employeeAssigneeId || selectedTask.assigneeId)
      ? peopleMap.get(selectedTask.employeeAssigneeId || selectedTask.assigneeId || "") ?? null
      : null;

  const shouldOpenTaskInPage = !standaloneTaskPage && taskDetailMode === "page";
  const handleOpenTask = useCallback(
    (taskId: string) => {
      if (shouldOpenTaskInPage) {
        router.push(`/projects/${projectId}/tasks/${taskId}`);
        return;
      }

      setSelectedTaskId(taskId);
    },
    [projectId, router, shouldOpenTaskInPage]
  );

  const taskDetailContent = selectedTask ? (
    <div className={`grid min-h-0 grid-cols-1 lg:grid-cols-[1.8fr_1fr] ${standaloneTaskPage ? "min-h-[calc(100vh-16rem)] rounded-xl border border-slate-200 bg-white shadow-sm" : "h-[92vh]"}`}>
      <DetailMainPanel
        assigningTaskId={assigningTaskId}
        buttonLabel={description.buttonLabel}
        buttonSize={description.buttonSize}
        buttonTheme={description.buttonTheme}
        buttonUrl={description.buttonUrl}
        buttonVariant={description.buttonVariant}
        descriptionDraft={description.descriptionDraft}
        descriptionInputRef={description.descriptionInputRef}
        descriptionPreviewContent={description.descriptionPreviewContent}
        descriptionUploadInputRef={description.descriptionUploadInputRef}
        employeeAssignments={employeeAssignments}
        handleTaskDeadlineUpdated={handleTaskDeadlineUpdated}
        isAddingSubtask={isAddingSubtask}
        isSavingDescription={description.isSavingDescription}
        movingTaskId={movingTaskId}
        onAddSubtask={addSubtask}
        onApplyDescriptionButton={description.applyDescriptionButton}
        onAssignEmployeeToTask={assignEmployeeToTask}
        onButtonLabelChange={description.setButtonLabel}
        onButtonSizeChange={description.setButtonSize}
        onButtonThemeChange={description.setButtonTheme}
        onButtonUrlChange={description.setButtonUrl}
        onButtonVariantChange={description.setButtonVariant}
        onDescriptionDraftChange={description.setDescriptionDraft}
        onDescriptionUploadChange={description.handleDescriptionUpload}
        onHandleDescriptionKeyDown={description.handleDescriptionKeyDown}
        onInsertBulletListItem={description.insertBulletListItem}
        onInsertChecklistItem={description.insertChecklistItem}
        onInsertIntoDescription={description.insertIntoDescription}
        onInsertNumberedListItem={description.insertNumberedListItem}
        onMoveTaskToStage={moveTaskToStage}
        onOpenTaskEmployeeProfile={openTaskEmployeeProfile}
        onResetSubtaskForm={resetSubtaskForm}
        onSaveTaskDescription={description.saveTaskDescription}
        onSetIsMediaPickerOpen={description.setIsMediaPickerOpen}
        onSetShowButtonBuilder={description.setShowButtonBuilder}
        onSetShowSubtaskForm={setShowSubtaskForm}
        onSetSubtaskAssigneeId={setSubtaskAssigneeId}
        onSetSubtaskTitle={setSubtaskTitle}
        onSetTaskAssigneePopoverTaskId={setTaskAssigneePopoverTaskId}
        peopleMap={peopleMap}
        projectId={projectId}
        projectName={projectName}
        projectTeamMembers={projectTeamMembers}
        selectedTask={selectedTask}
        showButtonBuilder={description.showButtonBuilder}
        showSubtaskForm={showSubtaskForm}
        stages={stages}
        standaloneTaskPage={standaloneTaskPage}
        subtaskAssigneeId={subtaskAssigneeId}
        subtaskTitle={subtaskTitle}
        taskAssignee={taskAssignee}
        taskAssigneePopoverTaskId={taskAssigneePopoverTaskId}
      />

      <DetailSidePanel
        activeSidePanel={activeSidePanel}
        activityContent={
          <DetailActivityContent
            activeSidePanel={activeSidePanel}
            filteredTaskActivityLogs={filteredTaskActivityLogs}
            normalizedTaskSearch={normalizedTaskSearch}
            peopleMap={peopleMap}
          />
        }
        assigningTaskId={assigningTaskId}
        attachmentInputRef={attachmentInputRef}
        employeeAssignments={employeeAssignments}
        emojiCategory={emojiCategory}
        emojiPickerRef={emojiPickerRef}
        emojiSearch={emojiSearch}
        filteredEmojiResults={filteredEmojiResults}
        isSendingMessage={isSendingMessage}
        messagesContent={
          <DetailMessagesContent
            filteredTaskComments={filteredTaskComments}
            normalizedTaskSearch={normalizedTaskSearch}
            taskComments={taskComments}
            taskSearchFilter={taskSearchFilter}
          />
        }
        messageText={messageText}
        normalizedTaskSearch={normalizedTaskSearch}
        onActiveSidePanelChange={setActiveSidePanel}
        onAssignEmployeeToTask={assignEmployeeToTask}
        onEmojiCategoryChange={setEmojiCategory}
        onEmojiSearchChange={setEmojiSearch}
        onMessageTextChange={setMessageText}
        onOpenTaskEmployeeProfile={openTaskEmployeeProfile}
        onSelectedAttachmentNameChange={setSelectedAttachmentName}
        onSendTaskMessage={sendTaskMessage}
        onSetShowEmojiPicker={setShowEmojiPicker}
        onSetShowTaskSearch={setShowTaskSearch}
        onSetShowTaskSearchFilter={setShowTaskSearchFilter}
        onSetTaskAssigneePopoverTaskId={setTaskAssigneePopoverTaskId}
        onTaskSearchFilterChange={setTaskSearchFilter}
        onTaskSearchTextChange={setTaskSearchText}
        selectedAttachmentName={selectedAttachmentName}
        selectedTask={selectedTask}
        showEmojiPicker={showEmojiPicker}
        showTaskSearch={showTaskSearch}
        showTaskSearchFilter={showTaskSearchFilter}
        standaloneTaskPage={standaloneTaskPage}
        taskAssignee={taskAssignee}
        taskAssigneePopoverTaskId={taskAssigneePopoverTaskId}
        taskSearchFilter={taskSearchFilter}
        taskSearchText={taskSearchText}
      />
    </div>
  ) : null;

  return (
    <div className={standaloneTaskPage ? "" : "space-y-4"}>
      {!standaloneTaskPage ? (
        <AdminProjectTaskBoard
          projectId={projectId}
          assignments={assignments}
          employees={employees}
          projectTeamId={projectTeamId}
          projectType={projectType}
          projectName={projectName}
          projectCategory={projectCategory}
          projectManagerName={projectManagerName}
          projectTags={projectTags}
          tasks={tasks}
          setTasks={setTasks}
          stages={stages}
          setStages={setStages}
          onOpenTask={handleOpenTask}
        />
      ) : null}

      {standaloneTaskPage ? taskDetailContent : null}

      {!standaloneTaskPage ? (
      <Dialog
        open={Boolean(selectedTask)}
        onOpenChange={(open) => {
          if (!open) closeTaskDetail();
        }}
      >
        <DialogContent
          showCloseButton
          showOverlay
          className="max-h-[96vh] max-w-[97vw] overflow-hidden border-slate-200 bg-white p-0 text-slate-900 sm:max-w-7xl"
        >
          {taskDetailContent}
        </DialogContent>
      </Dialog>
      ) : null}

      <DetailMediaDialog
        filteredIconResults={description.filteredIconResults}
        filteredMediaResults={description.filteredMediaResults}
        isOpen={description.isMediaPickerOpen}
        isSearchingMedia={description.isSearchingMedia}
        mediaResultFilter={description.mediaResultFilter}
        mediaSearch={description.mediaSearch}
        mediaSearchError={description.mediaSearchError}
        mediaTab={description.mediaTab}
        mediaUploadInputRef={description.mediaUploadInputRef}
        mediaUrl={description.mediaUrl}
        onAddMediaUrl={description.addMediaUrl}
        onAddSelectedMediaToDescription={description.addSelectedMediaToDescription}
        onMediaResultFilterChange={description.setMediaResultFilter}
        onMediaSearchChange={description.setMediaSearch}
        onMediaTabChange={description.setMediaTab}
        onMediaUrlChange={description.setMediaUrl}
        onOpenChange={(open) => {
          if (!open) {
            description.closeMediaPicker();
            return;
          }
          description.setIsMediaPickerOpen(true);
        }}
        onSearchMediaImages={description.searchMediaImages}
        onSelectMediaFileName={description.setSelectedMediaFileName}
        onSelectMediaIconId={description.selectMediaIcon}
        onSelectMediaImage={(image) => {
          description.setSelectedMediaImageUrl(image.fullUrl);
          description.setSelectedMediaImageTitle(image.title);
        }}
        onVideoCodeChange={description.setVideoCode}
        selectedMediaFileName={description.selectedMediaFileName}
        selectedMediaIconId={description.selectedMediaIconId}
        selectedMediaImageTitle={description.selectedMediaImageTitle}
        selectedMediaImageUrl={description.selectedMediaImageUrl}
        videoCode={description.videoCode}
      />

      <EmployeeProfileDialog
        selectedTaskEmployeeProfile={selectedTaskEmployeeProfile}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskEmployeeProfile(null);
        }}
      />
    </div>
  );
}
