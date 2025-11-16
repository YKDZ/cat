import type { ComputedRef, Ref } from "vue";
import { inject, onScopeDispose, provide } from "vue";

// px
export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_MIN_WIDTH = SIDEBAR_WIDTH;
export const SIDEBAR_MAX_WIDTH = 420;

// rem
export const SIDEBAR_WIDTH_MOBILE = 18;
export const SIDEBAR_WIDTH_ICON = 3;

export const SIDEBAR_KEYBOARD_SHORTCUT = "b";

export type SidebarContextValue = {
  state: ComputedRef<"expanded" | "collapsed">;
  side: Ref<"left" | "right">;
  open: Ref<boolean>;
  setOpen: (value: boolean) => void;
  isMobile: Ref<boolean>;
  openMobile: Ref<boolean>;
  setOpenMobile: (value: boolean) => void;
  toggleSidebar: () => void;
  width: Ref<number>;
  minWidth: Ref<number>;
  maxWidth: Ref<number>;
  widthIcon: Ref<number>;
  widthMobile: Ref<number>;
};

const sidebarRegistry = new Map<string, SidebarContextValue>();

export function provideSidebarContext(
  id: string,
  context: SidebarContextValue,
): void {
  provide(Symbol.for(id), context);
  sidebarRegistry.set(id, context);

  onScopeDispose(() => {
    const current = sidebarRegistry.get(id);
    if (current === context) {
      sidebarRegistry.delete(id);
    }
  });
}

export function useSidebar(id: string): SidebarContextValue {
  if (id) {
    const target = sidebarRegistry.get(id);
    if (!target) {
      throw new Error(
        `useSidebar: context for id "${id}" was not found. Make sure a <SidebarProvider id="${id}"> is mounted.`,
      );
    }
    return target;
  }

  const context = inject(Symbol.for(id), null);

  if (!context) {
    throw new Error(
      "useSidebar: context not found. Make sure to wrap your component tree in <SidebarProvider> or pass a valid id.",
    );
  }

  return context;
}
