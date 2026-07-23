const PROFILE_PIN_LENGTH = 4;
const PROFILE_PIN_INPUT_PATTERN = "[0-9]{4}";

const PROFILE_PIN_VALUE_PATTERN = /^\d{4}$/;

export const PROFILE_PIN_INPUT_PROPS = {
  type: "password",
  autoComplete: "off",
  inputMode: "numeric",
  pattern: PROFILE_PIN_INPUT_PATTERN,
  minLength: PROFILE_PIN_LENGTH,
  maxLength: PROFILE_PIN_LENGTH,
} as const;

export function isCompleteProfilePin(pin: string) {
  return PROFILE_PIN_VALUE_PATTERN.test(pin);
}
