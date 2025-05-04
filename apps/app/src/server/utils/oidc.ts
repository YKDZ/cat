// 获取用户信息
export const getUserInfo = async (accessToken: string) => {
  const response = await fetch(import.meta.env.OIDC_USERINFO_URI ?? "", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `UserInfo request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
};
