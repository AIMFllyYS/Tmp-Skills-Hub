export {};

declare global {
  interface Window {
    skillsHubDesktop?: {
      isDesktop: true;
      initialFolder?: string;
      stateFolder?: string;
      pickDirectory?: () => Promise<string | null>;
      onReconcileRequested?: (callback: () => void) => () => void;
      onPreferencesChanged?: (callback: () => void) => () => void;
    };
  }
}
