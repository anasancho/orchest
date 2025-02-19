import { useGlobalContext } from "@/contexts/GlobalContext";
import { useProjectsContext } from "@/contexts/ProjectsContext";
import { useFetchProjects } from "@/hooks/useFetchProjects";
import { useMounted } from "@/hooks/useMounted";
import React from "react";

export const useFetchProjectsForProjectsView = () => {
  const { setAlert } = useGlobalContext();
  const { dispatch } = useProjectsContext();
  const {
    projects: fetchedProjects,
    fetchProjects,
    setProjects,
    error: fetchProjectsError,
    isFetchingProjects,
  } = useFetchProjects({
    sessionCounts: true,
    activeJobCounts: true,
  });

  const mounted = useMounted();

  React.useEffect(() => {
    if (mounted.current && fetchProjectsError)
      setAlert("Error", "Error fetching projects");
  }, [fetchProjectsError, setAlert, mounted]);

  React.useEffect(() => {
    if (
      mounted.current &&
      !isFetchingProjects &&
      !fetchProjectsError &&
      fetchedProjects
    ) {
      dispatch({
        type: "SET_PROJECTS",
        payload: fetchedProjects,
      });
    }
  }, [
    fetchedProjects,
    mounted,
    isFetchingProjects,
    fetchProjectsError,
    dispatch,
  ]);

  return { fetchProjects, setProjects, isFetchingProjects };
};
