export type AuthMethod = {
  type: AuthMethodType;
  title: string;
};

export enum AuthMethodType {
  OIDC,
  MAGIC_LINK,
}
