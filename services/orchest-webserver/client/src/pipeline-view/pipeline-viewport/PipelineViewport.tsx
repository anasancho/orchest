import { Position } from "@/types";
import { getHeight, getOffset, getWidth } from "@/utils/jquery-replacement";
import { getScrollLineHeight } from "@/utils/webserver-utils";
import { uuidv4 } from "@orchest/lib-utils";
import classNames from "classnames";
import React from "react";
import {
  DEFAULT_SCALE_FACTOR,
  originTransformScaling,
  scaleCorrected,
} from "../common";
import { usePipelineCanvasContext } from "../contexts/PipelineCanvasContext";
import { usePipelineEditorContext } from "../contexts/PipelineEditorContext";
import { getFilePathForDragFile } from "../file-manager/common";
import { useFileManagerContext } from "../file-manager/FileManagerContext";
import { useValidateFilesOnSteps } from "../file-manager/useValidateFilesOnSteps";
import { INITIAL_PIPELINE_POSITION } from "../hooks/usePipelineCanvasState";
import { STEP_HEIGHT, STEP_WIDTH } from "../PipelineStep";
import { PipelineCanvas } from "./PipelineCanvas";
import { useKeyboardEventsOnViewport } from "./useKeyboardEventsOnViewport";
import { useMouseEventsOnViewport } from "./useMouseEventsOnViewport";

const CANVAS_VIEW_MULTIPLE = 3;

export type CanvasFunctions = {
  centerPipelineOrigin: () => void;
  centerView: () => void;
};

type Props = React.HTMLAttributes<HTMLDivElement> & {
  canvasRef: React.MutableRefObject<HTMLDivElement>;
  canvasFuncRef: React.MutableRefObject<CanvasFunctions>;
};

// scaling and drag-n-drop behaviors can be (almost) entirely separated
// scaling is only mutating the css properties of PipelineCanvas, it has nothing to do with drag-n-drop.
// this means that we don't need to re-render the UI components on PipelineCanvas when zoom-in, zoom-out, panning the canvas
// therefore, all the scaling states should reside in this component
// but some drag-n-drop behaviors requires the offset of PipelineCanvas, so we put usePipelineCanvasState in the context
// so PipelineEditor can use these state
const PipelineStepsOuterHolder: React.ForwardRefRenderFunction<
  HTMLDivElement,
  Props
> = ({ children, className, canvasRef, canvasFuncRef, ...props }, ref) => {
  const { dragFile } = useFileManagerContext();
  const {
    eventVars,
    mouseTracker,
    trackMouseMovement,
    dispatch,
    pipelineCwd,
    newConnection,
    environments,
    getOnCanvasPosition,
  } = usePipelineEditorContext();
  const {
    pipelineCanvasState: {
      panningState,
      pipelineOffset,
      pipelineOrigin,
      pipelineStepsHolderOffsetLeft,
      pipelineStepsHolderOffsetTop,
    },
    setPipelineCanvasState,
    resetPipelineCanvas,
  } = usePipelineCanvasContext();

  const localRef = React.useRef<HTMLDivElement>(null);
  const [canvasResizeStyle, resizeCanvas] = React.useState<React.CSSProperties>(
    {}
  );

  const getCurrentOrigin = React.useCallback(() => {
    let canvasOffset = getOffset(canvasRef.current);
    let viewportOffset = getOffset(localRef.current);

    const x = canvasOffset.left - viewportOffset.left;
    const y = canvasOffset.top - viewportOffset.top;

    return { x, y };
  }, [canvasRef]);

  const pipelineSetHolderOrigin = React.useCallback(
    (newOrigin: [number, number]) => {
      const [x, y] = newOrigin;
      const currentOrigin = getCurrentOrigin();
      let [translateX, translateY] = originTransformScaling(
        [x, y],
        eventVars.scaleFactor
      );

      setPipelineCanvasState((current) => ({
        pipelineOrigin: [x, y],
        pipelineStepsHolderOffsetLeft:
          translateX + currentOrigin.x - current.pipelineOffset[0],
        pipelineStepsHolderOffsetTop:
          translateY + currentOrigin.y - current.pipelineOffset[1],
      }));
    },
    [eventVars.scaleFactor, setPipelineCanvasState, getCurrentOrigin]
  );

  const centerView = React.useCallback(() => {
    resetPipelineCanvas();
    dispatch({ type: "SET_SCALE_FACTOR", payload: DEFAULT_SCALE_FACTOR });
  }, [dispatch, resetPipelineCanvas]);

  const centerPipelineOrigin = React.useCallback(() => {
    let viewportOffset = getOffset(localRef.current);
    const canvasOffset = getOffset(canvasRef.current);

    let viewportWidth = getWidth(localRef.current);
    let viewportHeight = getHeight(localRef.current);

    let originalX = viewportOffset.left - canvasOffset.left + viewportWidth / 2;
    let originalY = viewportOffset.top - canvasOffset.top + viewportHeight / 2;

    let centerOrigin = [
      scaleCorrected(originalX, eventVars.scaleFactor),
      scaleCorrected(originalY, eventVars.scaleFactor),
    ] as [number, number];

    pipelineSetHolderOrigin(centerOrigin);
  }, [canvasRef, eventVars.scaleFactor, pipelineSetHolderOrigin]);

  // NOTE: React.useImperativeHandle should only be used in special cases
  // here we have to use it to allow parent component (i.e. PipelineEditor) to center pipeline canvas
  // otherwise, we have to use renderProps, but then we will have more issues
  // e.g. we cannot keep the action buttons above PipelineCanvas
  React.useImperativeHandle(
    canvasFuncRef,
    () => ({ centerPipelineOrigin, centerView }),
    [centerPipelineOrigin, centerView]
  );

  React.useEffect(() => {
    if (
      pipelineOffset[0] === INITIAL_PIPELINE_POSITION[0] &&
      pipelineOffset[1] === INITIAL_PIPELINE_POSITION[1] &&
      eventVars.scaleFactor === DEFAULT_SCALE_FACTOR
    ) {
      console.log("DEV WOW????");
      pipelineSetHolderOrigin([0, 0]);
    }
  }, [eventVars.scaleFactor, pipelineOffset, pipelineSetHolderOrigin]);

  const pipelineSetHolderSize = React.useCallback(() => {
    if (!localRef.current) return;
    resizeCanvas({
      width: getWidth(localRef.current) * CANVAS_VIEW_MULTIPLE,
      height: getHeight(localRef.current) * CANVAS_VIEW_MULTIPLE,
    });
  }, [resizeCanvas, localRef]);

  const getMousePositionRelativeToCanvas = (e: React.WheelEvent) => {
    trackMouseMovement(e.clientX, e.clientY); // in case that user start zoom-in/out before moving their cursor
    const { x, y } = mouseTracker.current.client;
    let canvasOffset = getOffset(canvasRef.current);

    return [
      scaleCorrected(x - canvasOffset.left, eventVars.scaleFactor),
      scaleCorrected(y - canvasOffset.top, eventVars.scaleFactor),
    ] as [number, number];
  };

  const onPipelineCanvasWheel = (e: React.WheelEvent) => {
    let pipelineMousePosition = getMousePositionRelativeToCanvas(e);

    // set origin at scroll wheel trigger
    if (
      pipelineMousePosition[0] !== pipelineOrigin[0] ||
      pipelineMousePosition[1] !== pipelineOrigin[1]
    ) {
      pipelineSetHolderOrigin(pipelineMousePosition);
    }

    /* mouseWheel contains information about the deltaY variable
     * WheelEvent.deltaMode can be:
     * DOM_DELTA_PIXEL = 0x00
     * DOM_DELTA_LINE = 0x01 (only used in Firefox)
     * DOM_DELTA_PAGE = 0x02 (which we'll treat identically to DOM_DELTA_LINE)
     */

    let deltaY =
      e.nativeEvent.deltaMode == 0x01 || e.nativeEvent.deltaMode == 0x02
        ? getScrollLineHeight() * e.nativeEvent.deltaY
        : e.nativeEvent.deltaY;

    dispatch((current) => {
      return {
        type: "SET_SCALE_FACTOR",
        payload: Math.min(
          Math.max(current.scaleFactor - deltaY / 3000, 0.25),
          2
        ),
      };
    });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (eventVars.selectedConnection) {
      dispatch({ type: "DESELECT_CONNECTION" });
    }
    // not dragging the canvas, so user must be creating a selection rectangle
    // we need to save the offset of cursor against pipeline canvas
    if (e.button === 0 && panningState === "idle") {
      trackMouseMovement(e.clientX, e.clientY);
      dispatch({
        type: "CREATE_SELECTOR",
        payload: getOffset(canvasRef.current),
      });
    }
  };

  const onMouseUp = () => {
    if (eventVars.stepSelector.active) {
      dispatch({ type: "SET_STEP_SELECTOR_INACTIVE" });
    } else {
      dispatch({ type: "SELECT_STEPS", payload: { uuids: [] } });
    }

    if (eventVars.openedStep) {
      dispatch({ type: "SET_OPENED_STEP", payload: undefined });
    }

    if (newConnection.current) {
      dispatch({ type: "REMOVE_CONNECTION", payload: newConnection.current });
    }

    if (dragFile) onDropFiles();
  };

  const getApplicableStepFiles = useValidateFilesOnSteps();

  const createStepsWithFiles = React.useCallback(
    (dropPosition: Position) => {
      const { allowed } = getApplicableStepFiles();

      const environment = environments.length > 0 ? environments[0] : null;

      allowed.forEach((filePath) => {
        dispatch({
          type: "CREATE_STEP",
          payload: {
            title: "",
            uuid: uuidv4(),
            incoming_connections: [],
            file_path: getFilePathForDragFile(filePath, pipelineCwd),
            kernel: {
              name: environment?.language || "python",
              display_name: environment?.name || "Python",
            },
            environment: environment?.uuid,
            parameters: {},
            meta_data: {
              position: [dropPosition.x, dropPosition.y],
              hidden: false,
            },
          },
        });
      });
    },
    [dispatch, pipelineCwd, environments, getApplicableStepFiles]
  );

  const onDropFiles = React.useCallback(() => {
    // assign a file to a step cannot be handled here because PipelineStep onMouseUp has e.stopPropagation()
    // here we only handle "create a new step".
    // const targetElement = target as HTMLElement;
    const dropPosition = getOnCanvasPosition({
      x: STEP_WIDTH / 2,
      y: STEP_HEIGHT / 2,
    });

    createStepsWithFiles(dropPosition);
  }, [createStepsWithFiles, getOnCanvasPosition]);

  useMouseEventsOnViewport();
  useKeyboardEventsOnViewport(canvasFuncRef);

  React.useEffect(() => {
    pipelineSetHolderSize();
    window.addEventListener("resize", pipelineSetHolderSize);
    return () => {
      window.removeEventListener("resize", pipelineSetHolderSize);
    };
  }, [pipelineSetHolderSize]);

  return (
    <div
      id="pipeline-viewport"
      className={classNames(
        "pipeline-steps-outer-holder",
        panningState,
        className
      )}
      ref={(node) => {
        // in order to manipulate a forwarded ref, we need to create a local ref to capture it
        localRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      }}
      onWheel={onPipelineCanvasWheel}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      {...props}
    >
      <PipelineCanvas
        ref={canvasRef}
        style={{
          transformOrigin: `${pipelineOrigin[0]}px ${pipelineOrigin[1]}px`,
          transform:
            `translateX(${pipelineOffset[0]}px) ` +
            `translateY(${pipelineOffset[1]}px) ` +
            `scale(${eventVars.scaleFactor})`,
          left: pipelineStepsHolderOffsetLeft,
          top: pipelineStepsHolderOffsetTop,
          ...canvasResizeStyle,
        }}
      >
        {children}
      </PipelineCanvas>
    </div>
  );
};

export const PipelineViewport = React.forwardRef(PipelineStepsOuterHolder);
