import type { ComputedRef, Ref, InjectionKey } from "vue";
import { inject, onScopeDispose, provide } from "vue";

export const SIDEBAR_DEFAULT_ID = "sidebar";
export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const SIDEBAR_WIDTH = "16rem";
export const SIDEBAR_WIDTH_MOBILE = "18rem";
export const SIDEBAR_WIDTH_ICON = "3rem";
export const SIDEBAR_KEYBOARD_SHORTCUT = "b";

export const SIDEBAR_CONTEXT_KEY: InjectionKey<SidebarContextValue> =
  Symbol("SidebarContext");

export type SidebarContextValue = {
  state: ComputedRef<"expanded" | "collapsed">;
  open: Ref<boolean>;
  setOpen: (value: boolean) => void;
  isMobile: Ref<boolean>;
  openMobile: Ref<boolean>;
  setOpenMobile: (value: boolean) => void;
  toggleSidebar: () => void;
};

const sidebarRegistry = new Map<string, SidebarContextValue>();

export const getSidebarCookieName = (id: string): string =>
  `${SIDEBAR_COOKIE_NAME}-${id}`;

export function provideSidebarContext(
  id: string,
  context: SidebarContextValue,
): void {
  provide(SIDEBAR_CONTEXT_KEY, context);
  sidebarRegistry.set(id, context);

  onScopeDispose(() => {
    const current = sidebarRegistry.get(id);
    if (current === context) {
      sidebarRegistry.delete(id);
    }
  });
}

export function useSidebar(id?: string): SidebarContextValue {
  if (id) {
    const target = sidebarRegistry.get(id);
    if (!target) {
      throw new Error(
        `useSidebar: context for id "${id}" was not found. Make sure a <SidebarProvider id="${id}"> is mounted.`,
      );
    }
    return target;
  }

  const context = inject(SIDEBAR_CONTEXT_KEY, null);

  if (!context) {
    throw new Error(
      "useSidebar: context not found. Make sure to wrap your component tree in <SidebarProvider> or pass a valid id.",
    );
  }

  return context;
}
