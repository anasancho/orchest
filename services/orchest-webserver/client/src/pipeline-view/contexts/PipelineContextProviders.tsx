import React from "react";
import { CanvasScalingProvider } from "./CanvasScalingContext";
import { InteractiveRunsContextProvider } from "./InteractiveRunsContext";
import { PipelineCanvasContextProvider } from "./PipelineCanvasContext";
import { PipelineDataContextProvider } from "./PipelineDataContext";
import { PipelineRefsProvider } from "./PipelineRefsContext";
import { PipelineUiStateContextProvider } from "./PipelineUiStateContext";
import { ProjectFileManagerContextProvider } from "./ProjectFileManagerContext";

export const PipelineContextProviders: React.FC = ({ children }) => {
  return (
    <PipelineRefsProvider>
      <CanvasScalingProvider>
        <PipelineDataContextProvider>
          <PipelineUiStateContextProvider>
            <ProjectFileManagerContextProvider>
              <InteractiveRunsContextProvider>
                <PipelineCanvasContextProvider>
                  {children}
                </PipelineCanvasContextProvider>
              </InteractiveRunsContextProvider>
            </ProjectFileManagerContextProvider>
          </PipelineUiStateContextProvider>
        </PipelineDataContextProvider>
      </CanvasScalingProvider>
    </PipelineRefsProvider>
  );
};
