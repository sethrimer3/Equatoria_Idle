export interface LoadingGateState { completedLoops: number; isLoadingComplete: boolean; hasFailed: boolean }
export function canLeaveLoadingScreen(state: LoadingGateState): boolean {
  return state.hasFailed || (state.isLoadingComplete && state.completedLoops >= 2);
}
