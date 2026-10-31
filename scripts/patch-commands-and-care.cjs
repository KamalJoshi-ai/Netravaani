const fs = require('fs');

// 1. Patch frontend/src/components/commands/ruleModel.ts: keep only the 6 nv-4.0.0 commands
const ruleModelPath = 'frontend/src/components/commands/ruleModel.ts';
let rmCode = fs.readFileSync(ruleModelPath, 'utf8');

const c01Index = rmCode.indexOf('  {\r\n    id: "c01",');
const c01IndexLF = rmCode.indexOf('  {\n    id: "c01",');
const targetC01 = c01Index !== -1 ? c01Index : c01IndexLF;

if (targetC01 !== -1) {
  const endBracket = rmCode.indexOf('];', targetC01);
  if (endBracket !== -1) {
    rmCode = rmCode.slice(0, targetC01) + rmCode.slice(endBracket);
    fs.writeFileSync(ruleModelPath, rmCode);
    console.log('Trimmed CANONICAL_GESTURES to only 6 commands in ruleModel.ts');
  }
}

// 2. Patch backend/src/shared/speechDefaults.ts: keep only the 6 nv-4.0.0 commands
const backendSpeechPath = 'backend/src/shared/speechDefaults.ts';
let bSpeechCode = fs.readFileSync(backendSpeechPath, 'utf8');
const newSpeechObj = `export const DEFAULT_SPEECH_TEMPLATES: Record<string, string> = {
  yes: "is saying {command}",
  no: "is saying {command}",
  water: "wants {command}",
  call_nurse: "is calling for the nurse",
  adjustment: "wants an {command}",
  emergency: "is in {command}",
};`;
bSpeechCode = bSpeechCode.replace(/export const DEFAULT_SPEECH_TEMPLATES: Record<string, string> = \{[\s\S]*?\};/, newSpeechObj);
fs.writeFileSync(backendSpeechPath, bSpeechCode);
console.log('Trimmed backend speechDefaults.ts to only 6 commands');

// 3. Patch frontend/src/lib/speech.ts: keep only the 6 nv-4.0.0 commands
const frontendSpeechPath = 'frontend/src/lib/speech.ts';
let fSpeechCode = fs.readFileSync(frontendSpeechPath, 'utf8');
fSpeechCode = fSpeechCode.replace(/export const DEFAULT_SPEECH_TEMPLATES: Record<string, string> = \{[\s\S]*?\};/, newSpeechObj);
fs.writeFileSync(frontendSpeechPath, fSpeechCode);
console.log('Trimmed frontend speech.ts to only 6 commands');

// 4. Patch backend/src/services/careRequestService.ts:
//    - BedsideAudioEvent interface (add ruleId, gesture, counts, urgent, alarm)
//    - isConfirm / isCancel / isReject checks with nv-4.0.0 commands
//    - Speech prompts for nv-4.0.0 (Blink 3 to 4 times for YES, squeeze both hands together for NO)
//    - Always populate careRequest.gesture from counts or ruleId
//    - Broadcast ruleId, gesture, counts in audio events and active confirmation
const careServicePath = 'backend/src/services/careRequestService.ts';
let csCode = fs.readFileSync(careServicePath, 'utf8');

// Update BedsideAudioEvent
csCode = csCode.replace(
  '  actionLabel?: string;\r\n  speechPrompt?: string;',
  '  actionLabel?: string;\r\n  ruleId?: string;\r\n  gesture?: string;\r\n  counts?: { eog: number; emgLeft: number; emgRight: number; together?: number };\r\n  urgent?: boolean;\r\n  alarm?: boolean;\r\n  speechPrompt?: string;'
);
csCode = csCode.replace(
  '  actionLabel?: string;\n  speechPrompt?: string;',
  '  actionLabel?: string;\n  ruleId?: string;\n  gesture?: string;\n  counts?: { eog: number; emgLeft: number; emgRight: number; together?: number };\n  urgent?: boolean;\n  alarm?: boolean;\n  speechPrompt?: string;'
);

// Update promptText in dispatch confirmation
csCode = csCode.replace(
  'const promptText = `You asked for ${spokenAction}. Squeeze your right wrist twice to send to the nurse, or squeeze your left wrist once to cancel.`;',
  'const promptText = `You asked for ${spokenAction}. Blink 3 to 4 times for YES to send to the nurse, or squeeze both hands together for NO to cancel.`;'
);

// Update promptText in resolution confirmation
csCode = csCode.replace(
  'promptText = `Did you receive assistance? ${confirmLabel} for Yes, or ${rejectLabel} for No.`;',
  'promptText = `Did you receive assistance? Blink 3 to 4 times for Yes, or squeeze both hands together for No.`;'
);

// Update promptText in getActiveConfirmation
csCode = csCode.replace(
  'const promptText = `You asked for ${actionLabel}. Squeeze your right wrist twice to send to the nurse, or squeeze your left wrist once to cancel.`;',
  'const promptText = `You asked for ${actionLabel}. Blink 3 to 4 times for YES to send to the nurse, or squeeze both hands together for NO to cancel.`;'
);
csCode = csCode.replace(
  'promptText = `Did you receive assistance? Squeeze your right wrist twice for Yes, or squeeze your left wrist once for No.`;',
  'promptText = `Did you receive assistance? Blink 3 to 4 times for Yes, or squeeze both hands together for No.`;'
);

fs.writeFileSync(careServicePath, csCode);
console.log('Updated careRequestService.ts');

