export type DesktopWorkspaceSplitGateway = {
  readonly defaultRatio: number;
  readonly maximumRatio: number;
  readonly minimumRatio: number;
  loadRatio(): Promise<number>;
  listenRatio(callback: (splitRatio: number) => void): Promise<() => void>;
  persistRatio(splitRatio: number): Promise<number>;
};
