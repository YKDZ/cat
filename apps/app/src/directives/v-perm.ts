import type { ObjectType, Relation } from "@cat/shared";
import type { Directive } from "vue";

import { orpc } from "@/rpc/orpc";

export type PermBinding = {
  object: ObjectType;
  id: string;
  relation: Relation;
};

type PermEl = HTMLElement & {
  _permPlaceholder?: Comment;
  _permVisible?: boolean;
  _permBinding?: PermBinding;
};

const checkAndToggle = async (
  el: PermEl,
  binding: PermBinding,
): Promise<void> => {
  // Skip permission checks during SSR
  if (import.meta.env.SSR) return;

  const allowed = await orpc.permission.check({
    objectType: binding.object,
    objectId: binding.id,
    relation: binding.relation,
  });

  if (allowed && el._permVisible === false) {
    // Restore element
    const placeholder = el._permPlaceholder;
    if (placeholder?.parentNode) {
      placeholder.parentNode.insertBefore(el, placeholder);
      placeholder.parentNode.removeChild(placeholder);
    }
    el._permVisible = true;
    el._permPlaceholder = undefined;
  } else if (!allowed && el._permVisible !== false) {
    // Replace element with comment placeholder
    const placeholder = document.createComment("v-perm");
    el._permPlaceholder = placeholder;
    el._permVisible = false;
    if (el.parentNode) {
      el.parentNode.insertBefore(placeholder, el);
      el.parentNode.removeChild(el);
    }
  }
};

const bindingChanged = (a: PermBinding, b: PermBinding): boolean =>
  a.object !== b.object || a.id !== b.id || a.relation !== b.relation;

/**
 * v-perm directive — 无权限时从 DOM 移除元素（同 v-if 语义）
 *
 * 使用方式：
 * <Button v-perm="{ object: 'project', id: projectId, relation: 'editor' }">
 *   编辑项目
 * </Button>
 */
export const vPerm: Directive<PermEl, PermBinding> = {
  mounted(el, binding) {
    el._permVisible = true;
    el._permBinding = binding.value;
    void checkAndToggle(el, binding.value);
  },
  updated(el, binding) {
    if (!el._permBinding || bindingChanged(el._permBinding, binding.value)) {
      el._permBinding = binding.value;
      void checkAndToggle(el, binding.value);
    }
  },
  beforeUnmount(el) {
    // Clean up placeholder if element was hidden
    if (el._permPlaceholder?.parentNode) {
      el._permPlaceholder.parentNode.removeChild(el._permPlaceholder);
    }
  },
};
