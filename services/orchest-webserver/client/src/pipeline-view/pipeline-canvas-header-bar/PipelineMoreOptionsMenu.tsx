import { IconButton } from "@/components/common/IconButton";
import { useGlobalContext } from "@/contexts/GlobalContext";
import { useProjectsContext } from "@/contexts/ProjectsContext";
import { fetcher } from "@/utils/fetcher";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined"; // cspell:disable-line
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { hasValue } from "@orchest/lib-utils";
import React from "react";
import { usePipelineCanvasContext } from "../contexts/PipelineCanvasContext";
import { usePipelineDataContext } from "../contexts/PipelineDataContext";
import { useFileManagerContext } from "../file-manager/FileManagerContext";

const deletePipeline = (projectUuid: string, pipelineUuid: string) => {
  return fetcher(`/async/pipelines/${projectUuid}/${pipelineUuid}`, {
    method: "DELETE",
  });
};

export const PipelineMoreOptionsMenu = () => {
  const { fetchFileTrees } = useFileManagerContext();
  const { setConfirm } = useGlobalContext();
  const { isReadOnly } = usePipelineDataContext();
  const {
    state: { projectUuid, pipeline },
    dispatch,
  } = useProjectsContext();

  const [anchorElement, setAnchorElement] = React.useState<
    Element | undefined
  >();

  const handleClose = () => setAnchorElement(undefined);
  const handleOpen = (e: React.MouseEvent) => setAnchorElement(e.currentTarget);

  const showDeletePipelineDialog = () => {
    handleClose();
    if (isReadOnly || !projectUuid || !pipeline) return;
    setConfirm(
      `Delete "${pipeline?.path}"`,
      "Are you sure you want to delete this pipeline?",
      {
        onConfirm: async (resolve) => {
          // TODO: Freeze PipelineEditor until the delete operation is done.
          await deletePipeline(projectUuid, pipeline.uuid);
          dispatch((current) => {
            return {
              type: "SET_PIPELINES",
              payload: (current.pipelines || []).filter(
                (currentPipeline) => currentPipeline.uuid !== pipeline.uuid
              ),
            };
          });
          fetchFileTrees();
          resolve(true);
          return true;
        },
        confirmLabel: "Delete pipeline",
        cancelLabel: "Keep pipeline",
        confirmButtonColor: "error",
      }
    );
  };

  const { setFullscreenTab } = usePipelineCanvasContext();
  const openSettings = () => {
    setFullscreenTab("configuration");
    handleClose();
  };

  const isOpen = hasValue(anchorElement);

  return (
    <>
      <IconButton
        title="More options"
        size="small"
        data-test-id="pipeline-settings"
        onClick={handleOpen}
      >
        <MoreHorizOutlinedIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchorElement}
        id="pipeline-settings-menu"
        open={isOpen}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem disabled={!hasValue(pipeline)} onClick={openSettings}>
          <ListItemIcon>
            <SettingsOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Pipeline settings
        </MenuItem>
        <MenuItem
          disabled={isReadOnly || !hasValue(pipeline)}
          onClick={showDeletePipelineDialog}
        >
          <ListItemIcon>
            <DeleteOutlineOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Delete Pipeline
        </MenuItem>
      </Menu>
    </>
  );
};
