import { Code } from "@/components/common/Code";
import {
  DropZone,
  FileWithValidPath,
  generateUploadFiles,
  isUploadedViaDropzone,
} from "@/components/DropZone";
import { UploadFilesForm } from "@/components/UploadFilesForm";
import { useAppContext } from "@/contexts/AppContext";
import { useProjectsContext } from "@/contexts/ProjectsContext";
import { fetchProject } from "@/hooks/useFetchProject";
import { Project } from "@/types";
import {
  BackgroundTask,
  CreateProjectError,
  isNumber,
  withPlural,
} from "@/utils/webserver-utils";
import DeviceHubIcon from "@mui/icons-material/DeviceHub";
import DriveFolderUploadOutlinedIcon from "@mui/icons-material/DriveFolderUploadOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import ViewComfyIcon from "@mui/icons-material/ViewComfy";
import WarningIcon from "@mui/icons-material/Warning";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress, {
  LinearProgressProps,
} from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";
import useTheme from "@mui/material/styles/useTheme";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { fetcher, HEADER, uuidv4, validURL } from "@orchest/lib-utils";
import React from "react";
import { useFetchProjects } from "./hooks/useFetchProjects";
import { useImportGitRepo, validProjectName } from "./hooks/useImportGitRepo";

const ERROR_MAPPING: Record<CreateProjectError, string> = {
  "project move failed": "failed to move project because the directory exists.",
  "project name contains illegal character":
    "project name contains illegal character(s).",
} as const;

const getMappedErrorMessage = (key: CreateProjectError | string | null) => {
  if (key && ERROR_MAPPING[key] !== undefined) {
    return ERROR_MAPPING[key];
  } else {
    return "Unknown error. Please try again.";
  }
};

const getProjectNameFromUrl = (importUrl: string) => {
  const matchGithubRepoName = importUrl.match(/\/([^\/]+)\/?$/);
  return matchGithubRepoName ? matchGithubRepoName[1] : "";
};

const HelperText: React.FC = ({ children }) => (
  <Typography
    variant="caption"
    sx={{
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    }}
  >
    <WarningIcon
      sx={{
        marginRight: (theme) => theme.spacing(1),
        fontSize: (theme) => theme.typography.subtitle2.fontSize,
      }}
    />
    {children}
  </Typography>
);

const validateImportUrl = (
  importUrl: string
): { error: boolean; helperText: React.ReactNode } => {
  if (!validURL(importUrl))
    return {
      error: true,
      helperText: <HelperText>Not a valid HTTPS git repository URL</HelperText>,
    };

  // if the URL is not from Orchest, warn the user about it.
  const isOrchestExample = /^https:\/\/github.com\/orchest(\-examples)?\//.test(
    importUrl
  );

  if (!isOrchestExample)
    return {
      error: false,
      helperText: (
        <HelperText>
          The import URL was not from Orchest. Make sure you trust this git
          repository.
        </HelperText>
      ),
    };

  return { error: false, helperText: " " };
};

const ProjectMetadata = ({
  value,
}: {
  value: Project & { fileCount: number };
}) => {
  return (
    <Stack direction="row" justifyContent="space-around" alignItems="center">
      <Stack direction="column" alignItems="center">
        <InsertDriveFileOutlinedIcon
          fontSize="medium"
          sx={{ color: (theme) => alpha(theme.palette.common.black, 0.46) }}
        />
        <Typography
          variant="body2"
          sx={{ marginTop: (theme) => theme.spacing(1) }}
        >
          {withPlural(value.fileCount, "File")}
        </Typography>
      </Stack>
      <Stack direction="column" alignItems="center">
        <DeviceHubIcon
          fontSize="medium"
          sx={{ color: (theme) => alpha(theme.palette.common.black, 0.46) }}
        />
        <Typography
          variant="body2"
          sx={{ marginTop: (theme) => theme.spacing(1) }}
        >
          {withPlural(value.pipeline_count, "Pipeline")}
        </Typography>
      </Stack>
      <Stack direction="column" alignItems="center">
        <ViewComfyIcon
          fontSize="medium"
          sx={{ color: (theme) => alpha(theme.palette.common.black, 0.46) }}
        />
        <Typography
          variant="body2"
          sx={{ marginTop: (theme) => theme.spacing(1) }}
        >
          {withPlural(value.environment_count, "Environment")}
        </Typography>
      </Stack>
    </Stack>
  );
};

type ImportStatus =
  | "READY"
  | "IMPORTING"
  | "UPLOADING"
  | "FILES_STORED"
  | "SAVING_PROJECT_NAME";

const dialogTitleMappings: Record<ImportStatus, string> = {
  READY: "Import project",
  IMPORTING: "Importing project",
  UPLOADING: "Uploading project",
  FILES_STORED: "Complete",
  SAVING_PROJECT_NAME: "Upload complete",
};

export const ImportDialog: React.FC<{
  importUrl: string;
  setImportUrl: (url: string) => void;
  onImportComplete: (newProject: Pick<Project, "path" | "uuid">) => void;
  open: boolean;
  onClose: () => void;
  hideUploadOption?: boolean;
  filesToUpload?: FileList | File[];
}> = ({
  importUrl,
  setImportUrl,
  onImportComplete,
  open,
  onClose,
  hideUploadOption,
  filesToUpload,
}) => {
  const { setAlert } = useAppContext();

  const { projects, fetchProjects } = useFetchProjects();

  // Keep state.projects up-to-date
  // After importing an project, it will immediately navigate to `/pipeline` of the new project
  // If state.projects doesn't contain the new project, it will show "project doesn't exist" error in `/pipeline`.
  const { dispatch } = useProjectsContext();
  React.useEffect(() => {
    dispatch({ type: "SET_PROJECTS", payload: projects });
  }, [dispatch, projects]);

  // Because import will occur before user giving a name,
  // a temporary projectName (`project.path`) is needed to start with.
  // Once project is created (i.e. projectUuid is generated by BE),
  // use `projectUuid` to rename the project as user desires.
  // NOTE: everytime the dialog is open, a new uuid should be generated.
  const [projectName, setProjectName] = React.useState<string>("");
  const [tempProjectName, setTempProjectName] = React.useState<string>();

  React.useEffect(() => {
    if (open) setTempProjectName(uuidv4());
  }, [open]);

  const [
    shouldShowImportUrlValidation,
    setShouldShowImportUrlValidation,
  ] = React.useState(false);

  const [importStatus, setImportStatus] = React.useState<ImportStatus>("READY");

  const isAllowedToClose = React.useMemo(() => {
    return importStatus === "READY";
  }, [importStatus]);

  const onFinishedImportingGitRepo = React.useCallback(
    async (result: BackgroundTask | undefined) => {
      if (!result) {
        // failed to import
        setImportStatus("READY");
        return;
      }
      if (result.status === "FAILURE") {
        setImportStatus("READY");
        setShouldShowImportUrlValidation(false);
      }
      if (result.status === "SUCCESS") {
        setImportStatus("FILES_STORED");
        setProgress("imported");
        // result.result is project.path (tempProjectName), but project_uuid is not yet available,
        // because it requires a file-discovery request to instantiate `project_uuid`.
        // Therefore, send another GET call to get its uuid.
        const fetchedProjects = await fetcher<Project[]>(`/async/projects`);
        const foundProject = (fetchedProjects || []).find(
          (project) => project.path === result.result
        );

        if (foundProject) setNewProjectUuid(foundProject.uuid);
      }
    },
    []
  );

  const {
    startImport: fireImportGitRepoRequest,
    importResult,
    clearImportResult,
  } = useImportGitRepo(tempProjectName, importUrl, onFinishedImportingGitRepo);

  const [newProjectUuid, setNewProjectUuid] = React.useState("");

  const startImportGitRepo = () => {
    setImportStatus("IMPORTING");
    setProgress("unknown");
    fireImportGitRepoRequest();
    setProjectName(getProjectNameFromUrl(importUrl));
  };

  const reset = () => {
    setShouldShowImportUrlValidation(false);
    setImportUrl("");
    setProjectName("");
    setImportStatus("READY");
  };

  const closeDialog = async () => {
    if (newProjectUuid) {
      // Delete the temporary project
      try {
        await fetcher("/async/projects", {
          method: "DELETE",
          headers: HEADER.JSON,
          body: JSON.stringify({
            project_uuid: newProjectUuid,
          }),
        });
      } catch (error) {
        console.error(
          `Failed to delete the temporary project with UUID ${newProjectUuid}. ${error}`
        );
      }
    }
    reset();
    onClose();
  };

  const importUrlValidation = React.useMemo(
    () => validateImportUrl(importUrl),
    [importUrl]
  );

  const existingProjectNames = React.useMemo(() => {
    return projects.map((project) => project.path);
  }, [projects]);

  const projectNameValidation = React.useMemo(() => {
    // Before the dialog is fully closed,
    // the new name is already saved into BE, so it will prompt with "project name already exists" error.
    if (["SAVING_PROJECT_NAME", "READY"].includes(importStatus))
      return { error: false, helperText: " " };

    if (existingProjectNames.includes(projectName)) {
      return {
        error: true,
        helperText: `A project with the name "${projectName}" already exists.`,
      };
    }
    const validation = validProjectName(projectName);
    return {
      error: !validation.valid,
      // Assign an empty space when !shouldShowProjectNameValidation
      // to prevent UI jumping because of the height of `helperText` of `TextField`.
      helperText: validation.valid ? " " : validation.reason,
    };
  }, [existingProjectNames, projectName, importStatus]);

  const saveProjectName = async () => {
    if (!newProjectUuid || projectNameValidation.error) return;
    setImportStatus("SAVING_PROJECT_NAME");
    try {
      await fetcher(`/async/projects/${newProjectUuid}`, {
        method: "PUT",
        headers: HEADER.JSON,
        body: JSON.stringify({ name: projectName }),
      });
      await fetchProjects();
      onImportComplete({ path: projectName, uuid: newProjectUuid });
      reset();
    } catch (error) {
      // Project is imported with a uuid (i.e. `tempProjectName`), but failed to rename.
      // Because we want user to give a meaningful name before closing,
      // user is not allowed to close the dialog before successfully submit and save projectName.
      // NOTE: user will get stuck here if changing project name cannot be done.
      setImportStatus("FILES_STORED");
    }
  };

  // When importing a git repo, the progress cannot be tracked. So the progress is `unknown`.
  const [progress, setProgress] = React.useState<
    number | "unknown" | "imported"
  >("unknown");

  const progressStyle = React.useMemo<LinearProgressProps["variant"]>(() => {
    if (progress === "unknown") return "indeterminate";
    return "determinate";
  }, [progress]);

  const updateProgress = React.useCallback(
    (completedCount: number, totalCount: number) => {
      setProgress(Math.round((completedCount / totalCount) * 100));
    },
    []
  );

  const [newProjectMetadata, setNewProjectMetadata] = React.useState<
    Project & { fileCount: number }
  >();

  const createProjectAndUploadFiles = React.useCallback(
    async (
      projectName: string,
      files: File[] | FileList,
      onFileUploaded?: (completedCount: number, totalCount: number) => void
    ) => {
      const { project_uuid } = await fetcher<{ project_uuid: string }>(
        "/async/projects",
        {
          method: "POST",
          headers: HEADER.JSON,
          body: JSON.stringify({ name: projectName }),
        }
      );
      // Get all the default info for this project.
      const tempProject = await fetchProject(project_uuid);

      if (tempProject) {
        setNewProjectMetadata({
          ...tempProject,
          pipeline_count: Array.from(files).reduce(
            (count, file: File | FileWithValidPath) => {
              const isPipelineFile = isUploadedViaDropzone(file)
                ? file.path.endsWith(".orchest")
                : file.webkitRelativePath.endsWith(".orchest");
              return isPipelineFile ? count + 1 : count;
            },
            0
          ),
          fileCount: files.length,
        });
      }

      // Upload files
      await Promise.all(
        generateUploadFiles({
          projectUuid: project_uuid,
          root: "/project-dir",
          path: "/",
        })(files, onFileUploaded)
      );
      return project_uuid;
    },
    []
  );

  const uploadFilesAndSetImportStatus = React.useCallback(
    async (files: FileList | File[]) => {
      if (!tempProjectName) {
        setAlert(
          "Error",
          "Failed to create a temporary project to start uploading."
        );
        return;
      }

      setImportStatus("UPLOADING");
      const projectUuid = await createProjectAndUploadFiles(
        tempProjectName,
        files,
        updateProgress
      );
      setImportStatus("FILES_STORED");
      setNewProjectUuid(projectUuid);
      setProjectName("");
    },
    [
      createProjectAndUploadFiles,
      tempProjectName,
      setImportStatus,
      setProjectName,
      setAlert,
      updateProgress,
    ]
  );

  // If `filesToUpload` is provided, it means that the parent component has gotten files already.
  // Immediately jump to `IMPORTING`.
  React.useEffect(() => {
    if (filesToUpload && tempProjectName && importStatus === "READY") {
      uploadFilesAndSetImportStatus(filesToUpload);
    }
  }, [
    filesToUpload,
    tempProjectName,
    importStatus,
    uploadFilesAndSetImportStatus,
  ]);

  const theme = useTheme();

  const [isHoverDropZone, setIsHoverDropZone] = React.useState(false);

  const isShowingCancelButton = isAllowedToClose || newProjectUuid.length > 0;

  return (
    <Dialog
      open={open}
      onClose={isAllowedToClose ? closeDialog : undefined}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{dialogTitleMappings[importStatus]}</DialogTitle>
      <DialogContent>
        <Stack
          direction="column"
          spacing={2}
          data-test-id="import-project-dialog"
        >
          {importStatus === "READY" && (
            <>
              <Stack direction="column" spacing={1}>
                <Typography>
                  Paste <Code>HTTPS</Code> link to <Code>git</Code> repository:
                </Typography>
                <form
                  id="import-project"
                  onSubmit={(e) => {
                    e.preventDefault();
                    startImportGitRepo();
                  }}
                >
                  <TextField
                    fullWidth
                    autoFocus={hideUploadOption}
                    placeholder="Git repository URL"
                    onBlur={() => {
                      if (importUrl.length > 0)
                        setShouldShowImportUrlValidation(true);
                    }}
                    {...(shouldShowImportUrlValidation
                      ? importUrlValidation
                      : {
                          // When showing the FAILURE alert, the space of helperText should be removed.
                          // In other cases, helperText should take space to prevent UI jumping.
                          helperText:
                            importResult?.status === "FAILURE" ? "" : " ",
                        })}
                    value={importUrl}
                    onChange={(e) => {
                      if (e.target.value.length === 0)
                        setShouldShowImportUrlValidation(false);
                      setImportUrl(e.target.value);
                    }}
                    data-test-id="project-url-textfield"
                  />
                </form>
                {importResult?.status === "FAILURE" && (
                  <Alert
                    severity="error"
                    sx={{ marginTop: (theme) => theme.spacing(1) }}
                    onClose={clearImportResult}
                  >
                    Import failed: {getMappedErrorMessage(importResult.result)}
                  </Alert>
                )}
              </Stack>
              {!hideUploadOption && (
                <Stack direction="column" spacing={1}>
                  <Typography>Or upload from computer:</Typography>
                  <DropZone
                    disableOverlay
                    uploadFiles={uploadFilesAndSetImportStatus}
                  >
                    {(isDragActive) => (
                      <UploadFilesForm
                        folder
                        upload={uploadFilesAndSetImportStatus}
                      >
                        {(onClick) => (
                          <Stack
                            justifyContent="center"
                            alignItems="center"
                            direction="column"
                            onMouseOver={() => setIsHoverDropZone(true)}
                            onMouseLeave={() => setIsHoverDropZone(false)}
                            sx={{
                              height: "16vh",
                              border: (theme) =>
                                `2px dashed ${theme.palette.grey[400]}`,
                              backgroundColor: (theme) =>
                                theme.palette.common.white,
                              borderRadius: (theme) => theme.spacing(0.5),
                              cursor: "pointer",
                            }}
                            style={
                              isDragActive
                                ? {
                                    border: `2px dashed ${theme.palette.primary.main}`,
                                    backgroundColor: alpha(
                                      theme.palette.primary.main,
                                      0.08
                                    ),
                                  }
                                : isHoverDropZone
                                ? {
                                    border: `2px dashed ${theme.palette.grey[600]}`,
                                    backgroundColor: theme.palette.grey[50],
                                  }
                                : {}
                            }
                            onClick={onClick}
                          >
                            <DriveFolderUploadOutlinedIcon
                              fontSize="large"
                              sx={{
                                color: (theme) =>
                                  isDragActive
                                    ? theme.palette.primary.main
                                    : isHoverDropZone
                                    ? theme.palette.grey[600]
                                    : theme.palette.grey[500],
                              }}
                            />
                            <Typography variant="body2">{`Drag & drop project folder here`}</Typography>
                            <Button
                              sx={{ marginTop: (theme) => theme.spacing(1) }}
                            >
                              Browse files
                            </Button>
                          </Stack>
                        )}
                      </UploadFilesForm>
                    )}
                  </DropZone>
                </Stack>
              )}
            </>
          )}
          {importStatus !== "READY" && (
            <Stack direction="column" spacing={2}>
              {newProjectMetadata && (
                <ProjectMetadata value={newProjectMetadata} />
              )}
              <Stack direction="row" spacing={1} alignItems="center">
                <LinearProgress
                  value={isNumber(progress) ? progress : undefined}
                  variant={progressStyle}
                  sx={{ margin: (theme) => theme.spacing(1, 0), flex: 1 }}
                />
                <Typography variant="caption">
                  {isNumber(progress)
                    ? `${progress} %`
                    : progress === "unknown"
                    ? "Importing..."
                    : "Imported!"}
                </Typography>
              </Stack>
              <form
                id="save-project-name"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveProjectName();
                }}
              >
                <TextField
                  fullWidth
                  autoFocus
                  label="Project name"
                  value={projectName}
                  onChange={(e) => {
                    setProjectName(e.target.value.replace(/[^\w\.]/g, "-"));
                  }}
                  {...(projectName.length > 0
                    ? projectNameValidation
                    : { helperText: " " })}
                  disabled={importStatus === "SAVING_PROJECT_NAME"}
                  data-test-id="project-name-textfield"
                />
              </form>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {isShowingCancelButton && (
          <Button color="secondary" onClick={closeDialog} tabIndex={-1}>
            Cancel
          </Button>
        )}
        {importStatus === "READY" ? (
          <Button
            variant="contained"
            disabled={importUrlValidation.error}
            type="submit"
            form="import-project"
            data-test-id="import-project-ok"
          >
            Import
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={
              !projectName ||
              projectNameValidation.error ||
              ["IMPORTING", "UPLOADING", "SAVING_PROJECT_NAME"].includes(
                importStatus
              )
            }
            type="submit"
            form="save-project-name"
          >
            Save
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
