/** A message safe to show the person who caused it. */
export class KodiError extends Error {}

/** Thrown when a unit already has a deposit: the core anti-fraud rule. */
export class UnitLockedError extends KodiError {
  constructor() {
    super("This unit already has a deposit held on Kodi, so nobody else can pay for it.");
  }
}
