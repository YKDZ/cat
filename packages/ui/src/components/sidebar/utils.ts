import type { ComputedRef, Ref } from "vue";
import { inject, provide } from "vue";

// px
export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_MIN_WIDTH = SIDEBAR_WIDTH;
export const SIDEBAR_MAX_WIDTH = 420;

// rem
export const SIDEBAR_WIDTH_MOBILE = 18;
export const SIDEBAR_WIDTH_ICON = 3;
export const SIDEBAR_MOBILE_MAX_WIDTH = 768;

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

const sidebarInjectionKey = (id: string): symbol =>
  Symbol.for(`cat.sidebar.${id}`);

export function provideSidebarContext(
  id: string,
  context: SidebarContextValue,
): void {
  provide(sidebarInjectionKey(id), context);
}

export function useSidebar(id: string): SidebarContextValue {
  const context = inject(sidebarInjectionKey(id), null);

  if (!context) {
    throw new Error(
      id
        ? `useSidebar: context for id "${id}" was not found. Make sure a <SidebarProvider id="${id}"> is mounted.`
        : "useSidebar: context not found. Make sure to wrap your component tree in <SidebarProvider> or pass a valid id.",
    );
  }

  return context;
}
