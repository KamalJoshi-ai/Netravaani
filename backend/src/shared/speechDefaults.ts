/**
 * Voice announcements at the nurse station (dashboard only, never sent to the device).
 *
 * A rule's speech template completes the sentence "Patient on bed <bed> ...".
 * "{command}" is replaced with the command's name. Rules without their own
 * template use these defaults, then GENERIC_SPEECH_TEMPLATE.
 */
export const DEFAULT_SPEECH_TEMPLATES: Record<string, string> = {
  yes: "is saying {command}",
  no: "is saying {command}",
  water: "wants {command}",
  call_nurse: "is calling for the nurse",
  adjustment: "wants an {command}",
  emergency: "is in {command}",
};

export const GENERIC_SPEECH_TEMPLATE = "is saying {command}";
export const MAX_SPEECH_TEMPLATE = 120;

export function speechTemplateFor(ruleId: string | undefined, custom?: string | null): string {
  const own = custom?.trim();
  if (own) return own;
  return (ruleId && DEFAULT_SPEECH_TEMPLATES[ruleId]) || GENERIC_SPEECH_TEMPLATE;
}
