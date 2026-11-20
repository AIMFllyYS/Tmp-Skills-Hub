import { DualPathOnboardingView } from "./DualPathOnboardingView.js";

interface StoreOnboardingProps {
  title: string;
  clientCount: number;
  onInit: (skillsRoot?: string) => Promise<void>;
  onOpenAgent: () => void;
}

export function StoreOnboarding({ onInit, ...props }: StoreOnboardingProps): React.JSX.Element {
  return <DualPathOnboardingView {...props} showGitOptions={false} onInit={({ skillsRoot }) => onInit(skillsRoot)} />;
}
