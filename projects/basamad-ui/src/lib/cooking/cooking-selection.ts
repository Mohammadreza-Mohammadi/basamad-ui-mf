/** A node and time range picked in the overview, opened in the detail view. */
export interface CookingSelection {
  /** Encrypted kiln id from GetCookingKilns. */
  kilnId: string;
  node: number;
  from: number;
  to: number;
}
