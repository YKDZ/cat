import { customRef, ref, watch, type Ref } from "vue";
import type { PageContext, PageContextServer } from "vike/types";
import { useCookies } from "@vueuse/integrations/useCookies";

type CookieRefOptions<T> = {
  defaultValue?: T | undefined;
  encode: (value: T | undefined) => string | null;
  decode: (value: string | null | undefined) => T | undefined;
};

export const useCookieStringRef = (
  ctx: PageContext,
  name: string,
  defaultValue?: string,
): Ref<string | undefined> => {
  return useCookieRef(ctx, name, {
    defaultValue,
    encode: (value) => (value === undefined ? null : value),
    decode: (raw) => (raw === null || raw === undefined ? undefined : raw),
  });
};

export const useCookieBooleanRef = (
  ctx: PageContext,
  name: string,
  defaultValue?: boolean,
): Ref<boolean | undefined> => {
  return useCookieRef(ctx, name, {
    defaultValue,
    encode: (value) => {
      return value === undefined ? null : String(value);
    },
    decode: (raw) => {
      return raw === null || raw === undefined ? undefined : raw === "true";
    },
  });
};

export const useCookieNumberRef = (
  ctx: PageContext,
  name: string,
  defaultValue?: number,
): Ref<number | undefined> => {
  return useCookieRef(ctx, name, {
    defaultValue,
    encode: (value) => {
      return value === undefined ? null : String(value);
    },
    decode: (raw) => {
      return raw === null || raw === undefined ? undefined : Number(raw);
    },
  });
};

export const useCookieRef = <T = string>(
  ctx: PageContext,
  name: string,
  options: CookieRefOptions<T>,
): Ref<T | undefined> => {
  const { defaultValue = undefined } = options;

  if (!import.meta.env.SSR) {
    const cookies = useCookies([name], {
      doNotParse: true,
    });
    const initialRaw = cookies.get(name);
    // @ts-expect-error unsolvable
    const state: Ref<T | undefined> = ref(
      // oxlint-disable-next-line no-unsafe-argument
      options.decode(initialRaw) ?? defaultValue,
    );

    watch(
      state,
      (value) => {
        // oxlint-disable-next-line no-unsafe-argument
        const raw = options.encode(value);
        if (raw === null) {
          cookies.remove(name);
        } else {
          cookies.set(name, raw);
        }
      },
      { immediate: true },
    );

    return state;
  }

  // oxlint-disable-next-line no-unsafe-type-assertion
  const { helpers } = ctx as PageContextServer;
  const raw = helpers.getCookie(name);
  let decodedRaw;
  try {
    decodedRaw = raw ? decodeURIComponent(raw) : null;
  } catch {
    decodedRaw = raw;
  }
  let inner = options.decode(decodedRaw ?? undefined) ?? defaultValue;

  return customRef<T | undefined>((track, trigger) => ({
    get() {
      track();
      return inner;
    },
    set(value) {
      inner = value;
      const raw = options.encode(value);
      if (raw === null) {
        helpers.delCookie(name);
      } else {
        helpers.setCookie(name, raw);
      }
      trigger();
    },
  }));
};
