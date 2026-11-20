import { useState } from "react";
import { GitSettingsPanel } from "../git/GitSettingsPanel.js";
import { DualPathOnboardingView } from "./DualPathOnboardingView.js";

interface StoreOnboardingProps {
  title: string;
  clientCount: number;
  onInit: (skillsRoot?: string, enableGit?: boolean) => Promise<void>;
  onOpenAgent: () => void;
}

export function StoreOnboarding({ onInit, ...props }: StoreOnboardingProps): React.JSX.Element {
  const [enableGit, setEnableGit] = useState(false);
  return (
    <DualPathOnboardingView
      {...props}
      showGitOptions={false}
      gitOptions={<GitSettingsPanel enableOnInit={enableGit} onEnabledChange={setEnableGit} />}
      onInit={({ skillsRoot }) => onInit(skillsRoot, enableGit)}
    />
  );
}
