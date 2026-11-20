export {};

declare global {
  interface Window {
    skillsHubDesktop?: {
      isDesktop: true;
      onReconcileRequested?: (callback: () => void) => () => void;
      onPreferencesChanged?: (callback: () => void) => () => void;
    };
  }
}
