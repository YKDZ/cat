import { createHash, createHmac } from "crypto";

class Sender {
  /**
   * 计算 MD5 + BASE64
   */
  static MD5Base64(s: string): string {
    return createHash("md5").update(s).digest("base64");
  }

  /**
   * 计算 HMAC-SHA1
   */
  static HMACSha1(data: string, key: string): string {
    return createHmac("sha1", key).update(data).digest("base64");
  }

  /**
   * 获取 GMT 格式时间
   */
  static toGMTString(date: Date): string {
    return date.toUTCString();
  }

  static async send(
    url: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const urlObj = new URL(url);
    const method = "POST";
    const accept = "application/json";
    const contentType = "application/json;charset=utf-8";
    const path = urlObj.pathname + urlObj.search;
    const date = Sender.toGMTString(new Date());
    const host = urlObj.host;

    const bodyStr = JSON.stringify(body);

    const bodyMd5 = Sender.MD5Base64(bodyStr);
    const uuid = crypto.randomUUID();

    const stringToSign = [
      method,
      accept,
      bodyMd5,
      contentType,
      date,
      "x-acs-signature-method:HMAC-SHA1",
      `x-acs-signature-nonce:${uuid}`,
      "x-acs-version:2019-01-02",
      path,
    ].join("\n");

    const signature = Sender.HMACSha1(
      stringToSign,
      process.env.PLUGIN_ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? "",
    );

    const headers = new Headers({
      Accept: accept,
      "Content-Type": contentType,
      "Content-MD5": bodyMd5,
      Date: date,
      Host: host,
      Authorization: `acs ${process.env.PLUGIN_ALIBABA_CLOUD_ACCESS_KEY_ID}:${signature}`,
      "x-acs-signature-nonce": uuid,
      "x-acs-signature-method": "HMAC-SHA1",
      "x-acs-version": "2019-01-02",
    });

    // 5. 发送请求
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      return await response.json();
    } catch (error) {
      throw new Error(`发送 POST 请求出现异常：${error}`);
    }
  }
}

export default Sender;
