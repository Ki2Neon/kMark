export type DesktopWorkspaceSplitGateway = {
  readonly defaultRatio: number;
  readonly maximumRatio: number;
  readonly minimumRatio: number;
  loadRatio(): number | null;
  persistRatio(splitRatio: number): void;
};
