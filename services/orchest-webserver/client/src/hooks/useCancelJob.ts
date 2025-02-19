import { useJobsApi } from "@/api/jobs/useJobsApi";
import { useConfirm } from "./useConfirm";

/** Cancels a run after the user confirms it. */
export const useCancelJob = () => {
  const cancel = useJobsApi((api) => api.cancel);

  return useConfirm(cancel, {
    content: "Are you sure that you want to cancel this Job?",
    confirmLabel: "Cancel job",
    cancelLabel: "Close",
    confirmButtonColor: "error",
  });
};
