/**
 * Attention budget: at most `perHour` interruptions in any rolling hour.
 * Notifications beyond the budget are held and summarised, never dropped
 * silently. Errors (rejected or failed orders) always interrupt.
 */
export class AttentionBudget {
  private shown: number[] = [];
  private held = 0;
  private perHour: number;

  constructor(perHour: number) {
    this.perHour = perHour;
  }

  setBudget(perHour: number) {
    this.perHour = perHour;
  }

  /** Whether a notification may interrupt now; records it when allowed. */
  allow(now: number, critical = false): boolean {
    this.shown = this.shown.filter((at) => now - at < 3_600_000);
    if (critical || this.perHour <= 0 || this.shown.length < this.perHour) {
      this.shown.push(now);
      return true;
    }
    this.held += 1;
    return false;
  }

  /** Count of held notifications since the last call; resets the counter. */
  takeHeld(): number {
    const held = this.held;
    this.held = 0;
    return held;
  }
}
