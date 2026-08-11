import { create } from "zustand";

type SourceActionUiState = {
  draggingRecyclableSourceId?: string;
  setDraggingRecyclableSourceId: (id?: string) => void;
};

export const useSourceActionUiStore = create<SourceActionUiState>((set) => ({
  draggingRecyclableSourceId: undefined,
  setDraggingRecyclableSourceId: (id) => set({ draggingRecyclableSourceId: id }),
}));
