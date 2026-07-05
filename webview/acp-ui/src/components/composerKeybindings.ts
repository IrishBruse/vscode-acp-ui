export function shouldOpenNewChatOnCtrlT(args: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}): boolean {
    return (
        args.key.toLowerCase() === "t" &&
        (args.ctrlKey || args.metaKey) &&
        !args.altKey &&
        !args.shiftKey
    );
}

export function shouldCycleSessionModeOnShiftTab(args: {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
}): boolean {
    return (
        args.key === "Tab" &&
        args.shiftKey &&
        !args.ctrlKey &&
        !args.metaKey &&
        !args.altKey
    );
}

export function shouldCancelRunOnCtrlC(args: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    hasSelection: boolean;
    promptInFlight: boolean;
}): boolean {
    return (
        args.key.toLowerCase() === "c" &&
        args.ctrlKey &&
        !args.metaKey &&
        !args.altKey &&
        !args.shiftKey &&
        !args.hasSelection &&
        args.promptInFlight
    );
}
