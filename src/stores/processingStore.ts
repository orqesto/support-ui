import { create } from 'zustand';

type ProcessingTask = {
  id: string;
  type: 'email' | 'telegram' | 'general';
  message: string;
  startedAt: Date;
};

type ProcessingState = {
  tasks: ProcessingTask[];
  addTask: (type: ProcessingTask['type'], message: string) => string;
  removeTask: (id: string) => void;
  clearAll: () => void;
  isProcessing: boolean;
};

export const useProcessingStore = create<ProcessingState>((set) => ({
  tasks: [],
  isProcessing: false,

  addTask: (type, message) => {
    const id = `${type}-${Date.now()}`;
    const task: ProcessingTask = {
      id,
      type,
      message,
      startedAt: new Date(),
    };

    set((state) => ({
      tasks: [...state.tasks, task],
      isProcessing: true,
    }));

    return id;
  },

  removeTask: (id) => {
    set((state) => {
      const newTasks = state.tasks.filter((task) => task.id !== id);
      return {
        tasks: newTasks,
        isProcessing: newTasks.length > 0,
      };
    });
  },

  clearAll: () => {
    set({ tasks: [], isProcessing: false });
  },
}));
