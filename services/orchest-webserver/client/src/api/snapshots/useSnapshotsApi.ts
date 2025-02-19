import { SnapshotData } from "@/types";
import { memoizeFor, MemoizePending } from "@/utils/promise";
import create from "zustand";
import { snapshotsApi } from "./snapshotsApi";

export type SnapshotsApi = {
  snapshots?: SnapshotData[];
  fetchOne: MemoizePending<
    (snapshotUuid: string) => Promise<SnapshotData | undefined>
  >;
};

export const useSnapshotsApi = create<SnapshotsApi>((set, get) => {
  const replaceOrAddSnapshot = (newSnapshot: SnapshotData) => {
    const { snapshots = [] } = get();

    if (!snapshots.find((snap) => snap.uuid === newSnapshot.uuid)) {
      return [...snapshots, newSnapshot];
    } else {
      return snapshots.map((snap) =>
        snap.uuid === newSnapshot.uuid ? newSnapshot : snap
      );
    }
  };

  return {
    snapshots: undefined,
    fetchOne: memoizeFor(1000, async (snapshotUuid) => {
      const snapshot = await snapshotsApi.fetchOne(snapshotUuid);

      set({ snapshots: replaceOrAddSnapshot(snapshot) });
      return snapshot;
    }),
  };
});
