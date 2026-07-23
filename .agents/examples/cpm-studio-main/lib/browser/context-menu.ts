import type { MouseEvent } from "react";

export function openContextMenuFromClick(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();

  const trigger = event.currentTarget;
  const rect = trigger.getBoundingClientRect();
  const clientX = event.clientX || rect.left + rect.width / 2;
  const clientY = event.clientY || rect.top + rect.height / 2;

  trigger.dispatchEvent(
    new window.MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      cancelable: true,
      clientX,
      clientY,
    }),
  );
}
