const INTERACTIVE_SELECTORS = [
    "a",
    "button",
    "[role=button]",
    "[role=menuitem]",
    "[role=link]",
    "[role=checkbox]",
    "[role=switch]",
    "[role=tab]",
    "[role=option]",
    "[role=listbox]",
    "input",
    "textarea",
    "select",
    "label",
    "summary",
    "[data-interactive]",
    "[data-row-interactive]",
    "[data-prevent-row-click]",
    "[contenteditable]",
].join(",");

export function shouldHandleRowClick(
    event: React.MouseEvent<HTMLElement, MouseEvent>
): boolean {
    if (event.defaultPrevented) {
        return false;
    }

    const target = event.target;
    const element = target instanceof Element ? target : null;

    if (
        event.nativeEvent.button !== 0 ||
        event.nativeEvent.metaKey ||
        event.nativeEvent.ctrlKey ||
        event.nativeEvent.shiftKey ||
        event.nativeEvent.altKey ||
        element?.closest(INTERACTIVE_SELECTORS) ||
        (element instanceof HTMLElement && element.isContentEditable)
    ) {
        return false;
    }

    return true;
}
