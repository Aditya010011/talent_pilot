"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { NewInterviewDialog } from "@/components/interview/new-interview-dialog";

interface NewInterviewContextType {
  openNewInterview: (projectId?: string) => void;
  closeNewInterview: () => void;
}

const NewInterviewContext = createContext<NewInterviewContextType | undefined>(undefined);

export function NewInterviewProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();

  const openNewInterview = (projectId?: string) => {
    setActiveProjectId(projectId);
    setIsOpen(true);
  };

  const closeNewInterview = () => {
    setIsOpen(false);
  };

  return (
    <NewInterviewContext.Provider value={{ openNewInterview, closeNewInterview }}>
      {children}
      <NewInterviewDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        projectId={activeProjectId}
      />
    </NewInterviewContext.Provider>
  );
}

export function useNewInterview() {
  const context = useContext(NewInterviewContext);
  if (context === undefined) {
    throw new Error("useNewInterview must be used within a NewInterviewProvider");
  }
  return context;
}
